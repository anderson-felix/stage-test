import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { uploadTenantAsset } from "./storage";
import { resolverTenantId } from "./tenant-context";

/**
 * Página da empresa no LinkedIn:
 * 1. Usa SocialAccount (LinkedIn OAuth / cachedProfileJson) no PostgreSQL.
 * 2. Fallback: leitura da página pública (ADR 0010) persistida em SocialAccount.cachedProfileJson + MediaAsset.
 */
export const PAGINA_LINKEDIN = "stageconsulting";
export const PAGINA_URL = `https://br.linkedin.com/company/${PAGINA_LINKEDIN}`;

const VALIDADE_MS = 24 * 60 * 60 * 1000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export type PostLinkedIn = {
  id: string;
  url: string;
  tipo: "documento" | "imagem" | "video" | "texto";
  /** AAAA-MM-DD */
  data: string | null;
  texto: string;
  curtidas: number | null;
  /** URL no Azure Blob Storage (`/api/media/...`). */
  imagem: string | null;
  urn?: string | null;
  reacoes?: number | null;
  comentarios?: number | null;
};

export type FeedLinkedIn = {
  atualizadoEm: string;
  nome: string;
  seguidores: number | null;
  funcionarios: number | null;
  slogan: string | null;
  descricao: string | null;
  local: string | null;
  logo: string | null;
  posts: PostLinkedIn[];
  erro?: string;
  tentativaEm?: string;
};

export async function lerFeedLinkedIn(tenantId?: string): Promise<FeedLinkedIn | null> {
  try {
    const tid = await resolverTenantId(tenantId);
    const acc = await prisma.socialAccount.findUnique({
      where: { tenantId_platform: { tenantId: tid, platform: "linkedin" } },
    });
    if (acc?.cachedProfileJson && typeof acc.cachedProfileJson === "object") {
      const cached = acc.cachedProfileJson as Record<string, unknown>;
      if (Array.isArray(cached.posts)) {
        return cached as unknown as FeedLinkedIn;
      }
    }
  } catch {
    // Retorna null se não sincronizado
  }
  return null;
}

export function feedLinkedInVencido(feed: FeedLinkedIn | null): boolean {
  if (!feed) return true;
  const ultima = Math.max(
    new Date(feed.atualizadoEm).getTime(),
    feed.tentativaEm ? new Date(feed.tentativaEm).getTime() : 0
  );
  return Date.now() - ultima > VALIDADE_MS;
}

let emAndamento: Promise<FeedLinkedIn> | null = null;

export function atualizarFeedLinkedIn(tenantId?: string): Promise<FeedLinkedIn> {
  emAndamento ??= ler(tenantId).finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}

const desescapar = (s: string) => s.replace(/&amp;/g, "&");

async function salvarCacheLinkedIn(tid: string, feed: FeedLinkedIn) {
  await prisma.socialAccount.upsert({
    where: { tenantId_platform: { tenantId: tid, platform: "linkedin" } },
    create: {
      tenantId: tid,
      platform: "linkedin",
      handleOrPageId: PAGINA_LINKEDIN,
      cachedProfileJson: feed as unknown as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    },
    update: {
      cachedProfileJson: feed as unknown as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    },
  });
}

type Grafo = Record<string, unknown> & { "@type"?: string };

async function ler(tenantId?: string): Promise<FeedLinkedIn> {
  const tid = await resolverTenantId(tenantId);
  const anterior = await lerFeedLinkedIn(tid);

  async function baixar(url: string | null, nome: string): Promise<string | null> {
    if (!url?.startsWith("https://")) return null;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const asset = await uploadTenantAsset({
        tenantId: tid,
        category: "social_slide",
        fileName: `li-${nome}`,
        mimeType: "image/jpeg",
        buffer: Buffer.from(await res.arrayBuffer()),
      });
      return `/api/media/${asset.id}`;
    } catch {
      return null;
    }
  }

  try {
    const res = await fetch(PAGINA_URL, {
      headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`o LinkedIn respondeu ${res.status}`);
    const html = await res.text();
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    if (!ld) {
      throw new Error(
        "a página pública não trouxe os dados (o LinkedIn pode ter pedido login)"
      );
    }
    const json = JSON.parse(ld[1]) as { "@graph"?: Grafo[] } & Grafo;
    const grafo: Grafo[] = json["@graph"] ?? [json];

    const org = grafo.find((g) => g["@type"] === "Organization") as
      | {
          name?: string;
          slogan?: string;
          description?: string;
          logo?: { contentUrl?: string };
          numberOfEmployees?: { value?: number };
          address?: { addressLocality?: string; addressRegion?: string };
        }
      | undefined;
    const seguidores = /([\d.,]+)\s+(?:seguidores|followers)/.exec(html);

    const artigos = new Map<string, string>();
    for (const m of html.matchAll(
      /<article[^>]*data-activity-urn="urn:li:activity:(\d+)"[\s\S]*?<\/article>/g
    )) {
      artigos.set(m[1], m[0]);
    }

    const logo = await baixar(org?.logo?.contentUrl ?? null, "logo.jpg");

    const posts: PostLinkedIn[] = [];
    for (const g of grafo.filter((x) => x["@type"] === "SocialMediaPosting")) {
      const p = g as {
        url?: string;
        datePublished?: string;
        text?: string;
        headline?: string;
        interactionStatistic?: { userInteractionCount?: number };
      };
      const id = /activity-(\d+)/.exec(p.url ?? "")?.[1];
      if (!id || !p.url) continue;
      const artigo = artigos.get(id) ?? "";
      const imagemUrl =
        /data-delayed-url="(https:\/\/media\.licdn\.com\/dms\/image\/[^"]*feedshare[^"]*)"/.exec(
          artigo
        )?.[1];
      const tipo: PostLinkedIn["tipo"] = /native-document/.test(artigo)
        ? "documento"
        : /<video/.test(artigo)
          ? "video"
          : imagemUrl
            ? "imagem"
            : "texto";
      posts.push({
        id,
        url: p.url,
        tipo,
        data: p.datePublished ? p.datePublished.slice(0, 10) : null,
        texto: (p.text || p.headline || "").trim(),
        curtidas: p.interactionStatistic?.userInteractionCount ?? null,
        imagem:
          tipo === "imagem"
            ? await baixar(imagemUrl ? desescapar(imagemUrl) : null, `${id}.jpg`)
            : null,
      });
    }
    if (posts.length === 0 && !org) {
      throw new Error("não encontrei posts nem dados da empresa na página");
    }

    const feed: FeedLinkedIn = {
      atualizadoEm: new Date().toISOString(),
      nome: org?.name ?? "Stage Consulting",
      seguidores: seguidores ? parseInt(seguidores[1].replace(/[.,]/g, ""), 10) : null,
      funcionarios: org?.numberOfEmployees?.value ?? null,
      slogan: org?.slogan ?? null,
      descricao: org?.description ?? null,
      local: org?.address
        ? [org.address.addressLocality, org.address.addressRegion]
            .filter(Boolean)
            .join(", ") || null
        : null,
      logo,
      posts,
    };
    await salvarCacheLinkedIn(tid, feed);
    return feed;
  } catch (err) {
    const agora = new Date().toISOString();
    const comErro: FeedLinkedIn = anterior
      ? { ...anterior, erro: (err as Error).message, tentativaEm: agora }
      : {
          atualizadoEm: agora,
          nome: "Stage Consulting",
          seguidores: null,
          funcionarios: null,
          slogan: null,
          descricao: null,
          local: null,
          logo: null,
          posts: [],
          erro: (err as Error).message,
          tentativaEm: agora,
        };
    await salvarCacheLinkedIn(tid, comErro);
    return comErro;
  }
}
