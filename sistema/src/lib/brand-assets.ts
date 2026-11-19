import prisma from "./prisma";
import { load } from "cheerio";
import { getAppRuntimeConfig } from "./config";
import { downloadTenantAssetBuffer } from "./storage";

/** Logo pública de fallback (servida de `public/`). */
export const FALLBACK_LOGO_URL = "/logo-stage.png";

const MEDIA_URL = /^\/api\/media\/([a-zA-Z0-9_-]+)/;

export class MediaReferenceAuthorizationError extends Error {
  readonly code = "MEDIA_REFERENCE_FORBIDDEN";
  readonly statusCode = 403;
  constructor() { super("Referência interna de mídia não autorizada"); }
}

/**
 * Referências de logo que o HTML gerado pela IA ou legado pode conter:
 * `logo.png`, `./logo.png`, `/logo-stage.png`, `/api/ws/marca/assets/logo/Logotipo_Stage.png`, `marca/assets/logo/...`.
 * URLs `/api/media/<id>` NÃO são tocadas por este regex.
 */
export const LOGO_REF =
  /(["'(])((?:\.\/)?logo\.png|\/?logo-stage\.png|(?:\.\.\/)*(?:\/api\/ws\/)?marca\/assets\/logo\/[^"')\s]+|(?:\.\/)?Logotipo_Stage\.png)(["')])/gi;

/**
 * URL navegável da logo do tenant para uso no painel autenticado (iframe do editor/preview).
 * Prioriza `BrandProfile.logoBlobUrl`, depois um `MediaAsset` da categoria `logo`, e por fim o fallback público.
 */
export async function resolverLogoUrlTenant(tenantId: string): Promise<string> {
  const bp = await prisma.brandProfile.findUnique({
    where: { tenantId },
    select: { logoBlobUrl: true },
  });
  const raw = bp?.logoBlobUrl?.trim();
  if (raw) {
    const m = MEDIA_URL.exec(raw);
    if (m) {
      const owned = await prisma.mediaAsset.findFirst({
        where: { id: m[1], tenantId },
        select: { id: true },
      });
      if (owned) return `/api/media/${owned.id}`;
    } else if (/^https?:\/\//i.test(raw)) {
      return raw;
    } else {
      // Blob armazenado no fallback local de dev: expõe via MediaAsset correspondente, se existir
      const asset = await prisma.mediaAsset.findFirst({
        where: { tenantId, blobUrl: raw },
        select: { id: true },
      });
      if (asset) return `/api/media/${asset.id}`;
    }
  }

  const logoAsset = await prisma.mediaAsset.findFirst({
    where: { tenantId, category: "logo" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return logoAsset ? `/api/media/${logoAsset.id}` : FALLBACK_LOGO_URL;
}

/**
 * Bytes da logo do tenant como data URI (para renderização headless no Playwright, onde URLs relativas
 * do hub não são resolvíveis). Retorna `null` se o tenant não possui logo.
 */
export async function resolverLogoDataUriTenant(tenantId: string): Promise<string | null> {
  const bp = await prisma.brandProfile.findUnique({
    where: { tenantId },
    select: { logoBlobUrl: true },
  });

  let blobUrl: string | null = null;
  let mime = "image/png";
  const raw = bp?.logoBlobUrl?.trim();
  if (raw) {
    const m = MEDIA_URL.exec(raw);
    if (m) {
      const asset = await prisma.mediaAsset.findFirst({ where: { id: m[1], tenantId } });
      if (asset) {
        blobUrl = asset.blobUrl;
        mime = asset.mimeType || mime;
      }
    } else {
      blobUrl = raw;
    }
  }
  if (!blobUrl) {
    const asset = await prisma.mediaAsset.findFirst({
      where: { tenantId, category: "logo" },
      orderBy: { createdAt: "desc" },
    });
    if (asset) {
      blobUrl = asset.blobUrl;
      mime = asset.mimeType || mime;
    }
  }
  if (!blobUrl) return null;

  const dl = await downloadTenantAssetBuffer(blobUrl, { expectedTenantId: tenantId });
  if (!dl) return null;
  return `data:${dl.mimeType || mime};base64,${dl.buffer.toString("base64")}`;
}

/** Substitui as referências relativas/legadas de logo no HTML pela URL informada. */
export function substituirReferenciasLogo(html: string, logoUrl: string): string {
  return html.replace(LOGO_REF, (_m, abre: string, _ref: string, fecha: string) => `${abre}${logoUrl}${fecha}`);
}

/**
 * Converte todas as referências a `/api/media/[id]` no HTML em Data URIs inline (`data:${mimeType};base64,...`)
 * para que o Playwright renderize os slides perfeitamente em about:blank sem depender de requests de rede.
 */
export type HtmlAssetMode = "document" | "fragment";

export async function inlineMediaAssetsAsDataUris(
  html: string, tenantId: string, options: { mode: HtmlAssetMode } = { mode: "document" }
): Promise<string> {
  if (!tenantId) throw new Error("Tenant obrigatório para incorporar mídia");
  const origin = new URL(getAppRuntimeConfig().appBaseUrl).origin;
  const ids = new Set<string>();
  const replacements = new Map<string, string>();
  const rewrite = (ref: string) => {
    try {
      const url = new URL(ref, origin);
      if (url.origin !== origin || url.username || url.password) return ref;
      const id = /^\/api\/media\/([a-zA-Z0-9_-]+)$/.exec(url.pathname)?.[1];
      if (!id) return ref;
      ids.add(id);
      return replacements.get(id) ?? ref;
    } catch { return ref; }
  };
  const css = (value: string) => value.replace(
    /url\(\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s)'"\r\n]+))\s*\)/gi,
    (_match, quoted, single, bare) => `url("${rewrite(quoted ?? single ?? bare)}")`
  );
  const srcset = (value: string) => value.replace(
    /(^|,\s*)([^\s]+)([^,]*)/g,
    (_match, sep: string, raw: string, descriptor: string) => {
      const trailing = raw.endsWith(",") ? "," : "";
      return sep + rewrite(trailing ? raw.slice(0, -1) : raw) + trailing + descriptor;
    }
  );
  // LPs/setContent are documents. Fragment callers must opt in explicitly so
  // parse5 cannot discard html/head/body attributes and the document doctype.
  const $ = load(html, {}, options.mode === "document");
  const visit = () => {
    $("*").each((_i, node) => {
      const el = $(node);
      for (const attr of ["src", "href", "poster"]) {
        const value = el.attr(attr);
        if (value) el.attr(attr, rewrite(value));
      }
      for (const attr of ["srcset", "imagesrcset"]) {
        const value = el.attr(attr);
        if (value) el.attr(attr, srcset(value));
      }
      const style = el.attr("style");
      if (style) el.attr("style", css(style));
    });
    $("style").each((_i, node) => { const el = $(node); el.text(css(el.text())); });
  };
  visit();
  if (!ids.size) return html;
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: [...ids] }, tenantId },
  });
  if (assets.length !== ids.size) throw new MediaReferenceAuthorizationError();

  for (const asset of assets) {
      const dl = await downloadTenantAssetBuffer(asset.blobUrl, { expectedTenantId: tenantId });
      if (!dl) throw new Error("Mídia interna indisponível");
      const mime = dl.mimeType || asset.mimeType || "image/png";
      const dataUri = `data:${mime};base64,${dl.buffer.toString("base64")}`;
      replacements.set(asset.id, dataUri);
  }
  visit();
  return $.html();
}

export type ResolveLpHtmlOptions = {
  embedAsDataUri?: boolean;
};

/**
 * Resolve e substitui referências à logo e imagens da marca no HTML de uma Landing Page.
 * - Busca o BrandProfile (logoBlobUrl, websiteUrl) e dados do tenant (companyName);
 * - Substitui `src="logo.png"`, `src="./logo.png"`, `src="/logo-stage.png"`, `src="/api/ws/.../Logotipo_Stage.png"`
 *   pela `logoUrl` real do tenant (ou Data URI base64 quando `embedAsDataUri: true`);
 * - Quando `embedAsDataUri: true`, converte também todos os `/api/media/[id]` em Data URIs inline para arquivo autônomo offline.
 */
export async function resolveLpHtmlAssets(
  html: string,
  tenantId: string,
  options?: ResolveLpHtmlOptions
): Promise<string> {
  if (!html) return html;

  const brandProfile = await prisma.brandProfile.findUnique({
    where: { tenantId },
    include: {
      tenant: {
        select: { name: true, slug: true },
      },
    },
  });

  let logoUrl: string;
  if (options?.embedAsDataUri) {
    const dataUri = await resolverLogoDataUriTenant(tenantId);
    if (dataUri) {
      logoUrl = dataUri;
    } else {
      try {
        const fs = await import("fs/promises");
        const path = await import("path");
        const publicLogoPath = path.join(process.cwd(), "public", "logo-stage.png");
        const buf = await fs.readFile(publicLogoPath);
        logoUrl = `data:image/png;base64,${buf.toString("base64")}`;
      } catch {
        logoUrl = FALLBACK_LOGO_URL;
      }
    }
  } else {
    logoUrl = await resolverLogoUrlTenant(tenantId);
  }

  let processed = substituirReferenciasLogo(html, logoUrl);

  const companyName = brandProfile?.tenant?.name?.trim() || "";
  if (companyName) {
    processed = processed.replace(/\{\{\s*company(?:Name|_name)\s*\}\}/gi, companyName);
  }

  // Se embedAsDataUri estiver ativo, inlines também quaisquer `/api/media/[id]`
  if (options?.embedAsDataUri) {
    processed = await inlineMediaAssetsAsDataUris(processed, tenantId, { mode: "document" });
  }

  return processed;
}

/**
 * Injeta a logo e ativos do tenant no HTML antes da renderização no Playwright.
 */
export async function resolveHtmlBrandAssets(
  html: string, tenantId: string, options: { mode: HtmlAssetMode } = { mode: "document" }
): Promise<string> {
  const logoDataUri = await resolverLogoDataUriTenant(tenantId);
  let result = html;
  if (logoDataUri) {
    result = substituirReferenciasLogo(result, logoDataUri);
  }
  result = await inlineMediaAssetsAsDataUris(result, tenantId, options);
  return result;
}



