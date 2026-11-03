import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import { prisma } from "./prisma";
import { novaPagina } from "./render";
import { SOCIAL_DIR } from "./social";
import { resolverTenantId } from "./tenant-context";
import { resolveSafe } from "./workspace";

/**
 * Feed do Instagram do tenant:
 * 1. Usa SocialAccount (OAuth Graph API / cachedProfileJson) quando disponível no banco.
 * 2. Fallback: leitura de perfil público via Playwright (ADR 0010) apenas para visualização pública.
 */
export const PERFIL_INSTAGRAM = "stage.consulting";
export const PERFIL_URL = `https://www.instagram.com/${PERFIL_INSTAGRAM}/`;

const PASTA = `${SOCIAL_DIR}/_perfis/instagram`;
const ARQUIVO = `${PASTA}/feed.json`;
const VALIDADE_MS = 24 * 60 * 60 * 1000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export type PostInstagram = {
  codigo: string;
  url: string;
  tipo: "imagem" | "carrossel" | "video";
  fixado: boolean;
  /** AAAA-MM-DD, quando o Instagram informa. */
  data: string | null;
  /** Caminho no workspace da miniatura baixada. */
  imagem: string | null;
};

export type FeedInstagram = {
  atualizadoEm: string;
  seguidores: number | null;
  seguindo: number | null;
  totalPosts: number | null;
  bio: string | null;
  avatar: string | null;
  posts: PostInstagram[];
  erro?: string;
  tentativaEm?: string;
};

export async function lerFeedInstagram(tenantId?: string): Promise<FeedInstagram | null> {
  try {
    const tid = await resolverTenantId(tenantId);
    const acc = await prisma.socialAccount.findUnique({
      where: { tenantId_platform: { tenantId: tid, platform: "instagram" } },
    });
    if (acc?.cachedProfileJson && typeof acc.cachedProfileJson === "object") {
      const cached = acc.cachedProfileJson as Record<string, unknown>;
      if (Array.isArray(cached.posts)) {
        return cached as unknown as FeedInstagram;
      }
    }
  } catch {
    // Fallback para cache local
  }
  try {
    return JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ resolveSafe(ARQUIVO), "utf8")) as FeedInstagram;
  } catch {
    return null;
  }
}

export function feedVencido(feed: FeedInstagram | null): boolean {
  if (!feed) return true;
  const ultima = Math.max(new Date(feed.atualizadoEm).getTime(), feed.tentativaEm ? new Date(feed.tentativaEm).getTime() : 0);
  return Date.now() - ultima > VALIDADE_MS;
}

function numero(texto: string | undefined): number | null {
  if (!texto) return null;
  const m = /^([\d.,]+)\s*([KkMm])?$/.exec(texto.trim());
  if (!m) return null;
  const base = m[2] ? parseFloat(m[1].replace(/,/g, "")) : parseInt(m[1].replace(/[.,]/g, ""), 10);
  const mult = m[2]?.toLowerCase() === "k" ? 1e3 : m[2]?.toLowerCase() === "m" ? 1e6 : 1;
  return Number.isFinite(base) ? Math.round(base * mult) : null;
}

function dataDoAlt(alt: string | null): string | null {
  const m = /on ([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(alt ?? "");
  if (!m) return null;
  const d = new Date(`${m[1]} 12:00 UTC`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

let emAndamento: Promise<FeedInstagram> | null = null;

export function atualizarFeedInstagram(): Promise<FeedInstagram> {
  emAndamento ??= ler().finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}

async function ler(): Promise<FeedInstagram> {
  const anterior = await lerFeedInstagram();
  let page: Page | null = null;
  try {
    page = await novaPagina({ locale: "en-US", userAgent: UA, viewport: { width: 1280, height: 1600 } });
    await page.goto(PERFIL_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("a[href*='/p/'], a[href*='/reel/']", { timeout: 20_000 });
    await page.waitForTimeout(1500);

    const descricao = (await page.getAttribute("meta[name='description']", "content")) ?? "";
    const stats = /([\d.,]+[KkMm]?) Followers, ([\d.,]+[KkMm]?) Following, ([\d.,]+[KkMm]?) Posts/.exec(descricao);
    const bio = /on Instagram: "([^"]*)"/.exec(descricao)?.[1] ?? null;

    const itens = await page.$$eval("a[href*='/p/'], a[href*='/reel/']", (as) =>
      as.map((a) => {
        const img = a.querySelector("img");
        return {
          href: a.getAttribute("href") ?? "",
          src: img ? img.currentSrc || img.src : null,
          alt: img?.alt ?? null,
          icones: [...a.querySelectorAll("svg")].map((s) => s.getAttribute("aria-label") ?? ""),
        };
      }),
    );
    const avatarSrc = await page
      .$eval("header img", (img) => (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src)
      .catch(() => null);

    const dir = resolveSafe(PASTA);
    await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });

    const pagina = page;
    async function baixar(src: string | null, nome: string): Promise<string | null> {
      if (!src?.startsWith("https://")) return null;
      try {
        const res = await pagina.request.get(src, { timeout: 15_000 });
        if (!res.ok()) return null;
        await fs.writeFile(/*turbopackIgnore: true*/ path.join(dir, nome), await res.body());
        return `${PASTA}/${nome}`;
      } catch {
        return null;
      }
    }

    const posts: PostInstagram[] = [];
    const vistos = new Set<string>();
    for (const it of itens) {
      const m = /\/(p|reel|tv)\/([\w-]+)/.exec(it.href);
      if (!m || vistos.has(m[2])) continue;
      vistos.add(m[2]);
      const icones = it.icones.join(" ").toLowerCase();
      posts.push({
        codigo: m[2],
        url: `https://www.instagram.com/p/${m[2]}/`,
        tipo: m[1] !== "p" || /clip|reel|video/.test(icones) ? "video" : /carousel/.test(icones) ? "carrossel" : "imagem",
        fixado: /pinned/.test(icones),
        data: dataDoAlt(it.alt),
        imagem: await baixar(it.src, `${m[2]}.jpg`),
      });
    }
    if (posts.length === 0) throw new Error("o perfil não mostrou nenhum post (o Instagram pode ter pedido login)");
    posts.slice(0, 3).forEach((p, i) => {
      if (p.data && posts.slice(i + 1).some((q) => q.data && q.data > p.data!)) p.fixado = true;
    });

    const feed: FeedInstagram = {
      atualizadoEm: new Date().toISOString(),
      seguidores: numero(stats?.[1]),
      seguindo: numero(stats?.[2]),
      totalPosts: numero(stats?.[3]),
      bio,
      avatar: (await baixar(avatarSrc, "avatar.jpg")) ?? anterior?.avatar ?? null,
      posts,
    };

    const usados = new Set([...posts.map((p) => `${p.codigo}.jpg`), "avatar.jpg", "feed.json"]);
    for (const nome of await fs.readdir(/*turbopackIgnore: true*/ dir)) {
      if (!usados.has(nome)) await fs.rm(/*turbopackIgnore: true*/ path.join(dir, nome), { force: true });
    }
    await fs.writeFile(/*turbopackIgnore: true*/ resolveSafe(ARQUIVO), JSON.stringify(feed, null, 2) + "\n", "utf8");
    return feed;
  } catch (err) {
    const msg = (err as Error).message.split("\n")[0];
    if (!anterior) throw new Error(msg);
    const comErro = { ...anterior, erro: msg, tentativaEm: new Date().toISOString() };
    await fs.writeFile(/*turbopackIgnore: true*/ resolveSafe(ARQUIVO), JSON.stringify(comErro, null, 2) + "\n", "utf8");
    return comErro;
  } finally {
    await page?.close();
  }
}
