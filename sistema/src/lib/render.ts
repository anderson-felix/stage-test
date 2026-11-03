import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Browser, type BrowserContextOptions, type Page } from "playwright";
import { workspaceDir } from "./config";
import { resolveSafe } from "./workspace";
import type { Canal, Formato } from "./social";

/** Tamanho de cada slide por Formato (docs/PRD.md › Regras). */
export const DIMENSOES: Record<Formato, { width: number; height: number }> = {
  carrossel: { width: 1080, height: 1350 },
  "post-unico": { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

const FONTES_PERMITIDAS = ["fonts.googleapis.com", "fonts.gstatic.com"];

let browserPromise: Promise<Browser> | null = null;

/** Chromium headless compartilhado (render da Arte e leitura do Instagram). */
async function browser(): Promise<Browser> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b?.isConnected()) return b;
  }
  // Sem GPU: num servidor ligado por dias o processo de GPU morria e toda página nova dava "Target crashed".
  // PLAYWRIGHT_CHANNEL=msedge usa o Edge instalado: o Smart App Control do Windows bloqueia o Chromium do Playwright (sem assinatura).
  browserPromise = chromium.launch({ args: ["--disable-gpu"], channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
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

/** Arquivos que o render produz; vão para historico/ antes de um render novo ou de um upload. */
export function ehSaidaDeArte(nome: string): boolean {
  return /^slide-\d+\.(png|jpe?g)$/i.test(nome) || /^arte\.pdf$/i.test(nome);
}

/** Move a Arte atual (PNGs/PDF) para arte/historico/<data-hora>/, sem apagar nada. */
export async function arquivarArte(arteDir: string): Promise<void> {
  let nomes: string[];
  try {
    nomes = (await fs.readdir(/*turbopackIgnore: true*/ arteDir)).filter(ehSaidaDeArte);
  } catch {
    return;
  }
  if (nomes.length === 0) return;
  const destino = path.join(arteDir, "historico", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
  await fs.mkdir(/*turbopackIgnore: true*/ destino, { recursive: true });
  for (const nome of nomes) {
    await fs.rename(/*turbopackIgnore: true*/ path.join(arteDir, nome), path.join(destino, nome));
  }
}

const MAX_HTML_BYTES = 2 * 1024 * 1024;

/** Remove o que não pode ir para o arte.html: scripts, handlers `on*`, `javascript:` e marcas do Editor de Arte. */
export function limparHtmlArte(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/<style\b[^>]*\bid=["']__ed[^"']*["'][^>]*>[\s\S]*?<\/style\s*>/gi, "")
    .replace(/\s(?:on[a-z]+|contenteditable|data-ed-[a-z-]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "");
}

/**
 * Grava o arte.html vindo do Editor de Arte. O HTML anterior é copiado para
 * arte/historico/<data-hora>/ antes; quem chama re-renderiza em seguida.
 */
export async function salvarArteHtml(postRel: string, html: string): Promise<void> {
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) throw new Error("arte.html maior que 2 MB");
  const limpo = limparHtmlArte(html);
  if (!/class\s*=\s*["'][^"']*\bslide\b/.test(limpo)) throw new Error("o HTML precisa ter ao menos um .slide");

  await guardarHtmlNoHistorico(postRel);
  await fs.writeFile(/*turbopackIgnore: true*/ path.join(resolveSafe(`${postRel}/arte`), "arte.html"), limpo, "utf8");
}

/** Copia o arte.html atual para arte/historico/<data-hora>/ (antes de a IA ou o editor reescreverem). */
export async function guardarHtmlNoHistorico(postRel: string): Promise<void> {
  const arteDir = resolveSafe(`${postRel}/arte`);
  try {
    const destino = path.join(arteDir, "historico", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
    await fs.mkdir(/*turbopackIgnore: true*/ destino, { recursive: true });
    await fs.copyFile(/*turbopackIgnore: true*/ path.join(arteDir, "arte.html"), path.join(destino, "arte.html"));
  } catch {
    // ainda não há HTML
  }
}

/**
 * Renderiza `<post>/arte/arte.html`: um PNG por `.slide` e, no carrossel do LinkedIn,
 * também `arte.pdf`. A Arte anterior vai para historico/.
 */
export function renderizarArte(postRel: string, canal: Canal, formato: Formato): Promise<{ slides: number; pdf: boolean }> {
  const job = fila.then(() => render(postRel, canal, formato));
  fila = job.catch(() => undefined);
  return job;
}

async function render(postRel: string, canal: Canal, formato: Formato) {
  const arteDir = resolveSafe(`${postRel}/arte`);
  const htmlFile = path.join(arteDir, "arte.html");
  await fs.access(/*turbopackIgnore: true*/ htmlFile).catch(() => {
    throw new Error("arte.html não encontrado: a IA não gerou a Arte");
  });

  const { width, height } = DIMENSOES[formato];
  const raiz = workspaceDir();
  const page = await novaPagina({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    // Só arquivos do workspace e Google Fonts: o HTML foi escrito pela IA e não deve buscar nada além disso.
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.protocol === "data:") return route.continue();
      if (url.protocol === "file:") {
        const local = path.resolve(fileURLToPath(url));
        return local === raiz || local.startsWith(raiz + path.sep) ? route.continue() : route.abort();
      }
      return url.protocol === "https:" && FONTES_PERMITIDAS.includes(url.hostname) ? route.continue() : route.abort();
    });

    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "networkidle", timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);

    const slides = page.locator(".slide");
    const total = await slides.count();
    if (total === 0) throw new Error("arte.html sem nenhum .slide");

    await arquivarArte(arteDir);
    for (let i = 0; i < total; i++) {
      await slides.nth(i).screenshot({ path: path.join(arteDir, `slide-${String(i + 1).padStart(2, "0")}.png`) });
    }

    const pdf = canal === "linkedin" && formato === "carrossel";
    if (pdf) {
      await page.addStyleTag({
        content: `@page { size: ${width}px ${height}px; margin: 0 } body { margin: 0 } .slide { break-after: page }`,
      });
      await page.pdf({ path: path.join(arteDir, "arte.pdf"), width: `${width}px`, height: `${height}px`, printBackground: true });
    }
    return { slides: total, pdf };
  } finally {
    await page.close();
  }
}
