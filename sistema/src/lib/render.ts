import { Prisma } from "@prisma/client";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright";
import prisma from "./prisma";
import { uploadTenantAsset } from "./storage";
import type { Formato } from "./social";
import {
  inlineMediaAssetsAsDataUris,
  resolverLogoDataUriTenant,
  substituirReferenciasLogo,
} from "./brand-assets";

/** Tamanho de cada slide por Formato (docs/PRD.md › Regras). */
export const DIMENSOES: Record<Formato | "quadrado" | "video", { width: number; height: number }> = {
  carrossel: { width: 1080, height: 1350 },
  "post-unico": { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  quadrado: { width: 1080, height: 1080 },
  video: { width: 1080, height: 1920 },
};

const FONTES_PERMITIDAS = ["fonts.googleapis.com", "fonts.gstatic.com"];

let browserPromise: Promise<Browser> | null = null;

/** Chromium headless compartilhado (render da Arte e leitura do Instagram). */
async function browser(): Promise<Browser> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b?.isConnected()) return b;
  }
  browserPromise = chromium.launch({
    args: ["--disable-gpu"],
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  });
  return browserPromise;
}

/**
 * Página nova (com contexto próprio; fechar a página fecha o contexto). Se o Chromium compartilhado
 * travou mas segue "conectado", ele é descartado e a abertura é tentada de novo uma vez.
 */
export async function novaPagina(opcoes: BrowserContextOptions = {}): Promise<Page> {
  try {
    return await (await browser()).newPage(opcoes);
  } catch {
    const velho = browserPromise;
    browserPromise = null;
    await velho?.then((b) => b.close()).catch(() => undefined);
    return (await browser()).newPage(opcoes);
  }
}

// Um render por vez: o Chromium é compartilhado e os renders são pesados.
let fila: Promise<unknown> = Promise.resolve();

const MAX_HTML_BYTES = 2 * 1024 * 1024;

/** Remove o que não pode ir para o arte.html: scripts, handlers `on*`, `javascript:` e marcas do Editor de Arte. */
export function limparHtmlArte(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/<style\b[^>]*\bid=["']__ed[^"']*["'][^>]*>[\s\S]*?<\/style\s*>/gi, "")
    .replace(
      /\s(?:on[a-z]+|contenteditable|data-ed-[a-z-]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
      ""
    )
    .replace(/\s(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "");
}

/**
 * Valida o tamanho e estrutura do HTML da Arte.
 */
export function validarHtmlArte(html: string): string {
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    throw new Error("arte.html maior que 2 MB");
  }
  const limpo = limparHtmlArte(html);
  if (!/class\s*=\s*["'][^"']*\bslide\b/.test(limpo)) {
    throw new Error("o HTML precisa ter ao menos um .slide");
  }
  return limpo;
}

/**
 * Renderiza o `arteHtml` de um SocialPost no Playwright headless (1080x1350 / 1080x1080 / 1080x1920 com deviceScaleFactor: 2),
 * captura screenshot PNG de cada elemento `.slide`, envia cada buffer para o Azure Blob Storage via `storage.ts` (`category: 'post_slide'`),
 * cria `MediaAsset` e atualiza `SocialPost.slidesBlobUrls` no PostgreSQL.
 */
export function renderSocialPostHtmlToBlobs(
  tenantId: string,
  postId: string,
  arteHtml: string,
  format: string = "carrossel"
): Promise<string[]> {
  const job = fila.then(() =>
    executarRenderParaBlobs(tenantId, postId, arteHtml, format)
  );
  fila = job.catch(() => undefined);
  return job;
}

async function executarRenderParaBlobs(
  tenantId: string,
  postId: string,
  arteHtml: string,
  format: string
): Promise<string[]> {
  let limpo = validarHtmlArte(arteHtml);

  // 1. Resolve a logo do Tenant em Data URI e substitui referências no HTML
  const logoDataUri = await resolverLogoDataUriTenant(tenantId).catch(() => null);
  if (logoDataUri) {
    limpo = substituirReferenciasLogo(limpo, logoDataUri);
  }

  // 2. Converte todas as imagens de /api/media/[id] para Data URIs inline
  limpo = await inlineMediaAssetsAsDataUris(limpo).catch(() => limpo);

  // 3. Injeta a tag <base> para que links remanescentes resolvam contra o host da aplicação
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const baseTag = `<base href="${appBaseUrl.replace(/\/+$/, "")}/">`;
  if (/<head\b[^>]*>/i.test(limpo)) {
    limpo = limpo.replace(/<head\b[^>]*>/i, `$&${baseTag}`);
  } else {
    limpo = `${baseTag}${limpo}`;
  }

  const dimKey =
    format in DIMENSOES ? (format as keyof typeof DIMENSOES) : "carrossel";
  const { width, height } = DIMENSOES[dimKey];

  const page = await novaPagina({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });

  try {
    let appHost = "";
    try {
      appHost = new URL(appBaseUrl).hostname;
    } catch {
      // ignore
    }

    await page.route("**/*", (route) => {
      const reqUrl = route.request().url();
      if (reqUrl.startsWith("data:") || reqUrl.startsWith("about:")) {
        return route.continue();
      }
      try {
        const parsed = new URL(reqUrl);
        if (parsed.protocol === "https:" && FONTES_PERMITIDAS.includes(parsed.hostname)) {
          return route.continue();
        }
        if (
          parsed.pathname.startsWith("/api/media/") ||
          (appHost && parsed.hostname === appHost) ||
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1"
        ) {
          return route.continue();
        }
      } catch {
        // ignore URL parse error
      }
      return route.abort();
    });

    await page.setContent(limpo, { waitUntil: "networkidle", timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);

    const slidesLocator = page.locator(".slide");
    const total = await slidesLocator.count();
    if (total === 0) {
      throw new Error("arte.html sem nenhum .slide");
    }

    const slideUrls: string[] = [];

    for (let i = 0; i < total; i++) {
      const pngBuffer = await slidesLocator.nth(i).screenshot({ type: "png" });
      const slideNum = String(i + 1).padStart(2, "0");
      const filename = `post-${postId}-slide-${slideNum}.png`;

      const asset = await uploadTenantAsset({
        tenantId,
        category: "social_slide",
        fileName: filename,
        mimeType: "image/png",
        buffer: Buffer.from(pngBuffer),
      });

      slideUrls.push(`/api/media/${asset.id}`);
    }

    await prisma.socialPost.update({
      where: { id: postId },
      data: {
        slidesBlobUrls: slideUrls as Prisma.InputJsonValue,
      },
    });

    return slideUrls;
  } finally {
    await page.close();
  }
}
