import fs from "node:fs/promises";
import path from "node:path";
import { PautaStatus, Prisma } from "@prisma/client";
import prisma from "./prisma";
import { joinFrontmatter, slugify, splitFrontmatter } from "./frontmatter";
import { resolverTenantId } from "./tenant-context";
import { resolveSafe } from "./workspace";

/** Pasta das Pautas dentro do workspace (ver docs/BACKEND.md). */
export const SOCIAL_DIR = "marketing/social";

export const STATUSES = ["rascunho", "aprovado", "em-design", "pronto", "publicado"] as const;
export const CANAIS = ["instagram", "linkedin"] as const;
export const FORMATOS = ["carrossel", "post-unico", "story"] as const;
export const SERIES = [
  "cultura-em-acao",
  "dado",
  "na-midia",
  "socios",
  "evento",
  "conteudo",
] as const;

export type Status = (typeof STATUSES)[number];
export type Canal = (typeof CANAIS)[number];
export type Formato = (typeof FORMATOS)[number];
export type Serie = (typeof SERIES)[number];

/** Formatos aceitos por Canal (docs/PRD.md › Regras). */
export const FORMATOS_POR_CANAL: Record<Canal, readonly Formato[]> = {
  instagram: ["carrossel", "post-unico", "story"],
  linkedin: ["carrossel", "post-unico"],
};

export type Pauta = {
  id?: string;
  slug: string;
  titulo: string;
  angulo: string;
  exemplo: boolean;
};

export type PostResumo = {
  id?: string;
  /** Caminho relativo ao workspace, ex.: marketing/social/2026-10-14-x/instagram-carrossel */
  path: string;
  slug: string;
  pauta: Pauta;
  canal: Canal;
  formato: Formato;
  serie: Serie;
  status: Status;
  dataPlanejada: string | null;
  origemArte: "ia" | "designer" | null;
  publicadoEm: string | null;
  /** Link do post já publicado no Canal (ex.: instagram.com/p/…), para mostrar o post real. */
  link: string | null;
  /** Primeiro slide da Arte (para o card do Quadro), preenchido por listarPosts. */
  capa?: { path: string; versao: number } | null;
};

/** Post cujo frontmatter não segue o esquema; aparece como aviso no Quadro. */
export type PostInvalido = { path: string; problema: string };

export type IndiceSocial = { posts: PostResumo[]; invalidos: PostInvalido[] };

export type ArteHistoryMeta = {
  postSlug?: string;
  serie?: string;
  legacyStatus?: string;
  dataPlanejada?: string | null;
  origemArte?: "ia" | "designer" | null;
  publicadoEm?: string | null;
  linkPublicado?: string | null;
  pdfUrl?: string | null;
  versao?: number;
  snapshots?: Array<{
    timestamp: string;
    slides: string[];
    hasHtml: boolean;
    htmlContent?: string;
  }>;
};

/** YAML converte datas sem aspas em Date; normaliza para AAAA-MM-DD. */
function toDate(value: unknown): string | null {
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value.trim())) {
    return value.trim().slice(0, 10);
  }
  return null;
}

function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return list.includes(value as T) ? (value as T) : null;
}

function mapLegacyStatusToEnum(status: Status): PautaStatus {
  switch (status) {
    case "publicado":
      return PautaStatus.PUBLISHED;
    case "pronto":
      return PautaStatus.SCHEDULED;
    case "em-design":
      return PautaStatus.DESIGN;
    case "aprovado":
      return PautaStatus.APPROVED;
    default:
      return PautaStatus.SCRIPT_REVIEW;
  }
}

function mapEnumToLegacyStatus(status: PautaStatus, legacyStatus?: string): Status {
  const fromLegacy = oneOf(STATUSES, legacyStatus);
  if (fromLegacy) return fromLegacy;
  switch (status) {
    case PautaStatus.PUBLISHED:
      return "publicado";
    case PautaStatus.SCHEDULED:
      return "pronto";
    case PautaStatus.DESIGN:
      return "em-design";
    case PautaStatus.APPROVED:
      return "aprovado";
    default:
      return "rascunho";
  }
}

function parsePautaModel(row: {
  id: string;
  slug: string;
  title: string;
  briefingMarkdown: string | null;
}): Pauta {
  const { data } = splitFrontmatter(row.briefingMarkdown ?? "");
  return {
    id: row.id,
    slug: row.slug,
    titulo: row.title || (typeof data.titulo === "string" ? data.titulo : row.slug),
    angulo: typeof data.angulo === "string" ? data.angulo : "",
    exemplo: data.exemplo === true,
  };
}

function getPostMeta(arteHistoryJson: Prisma.JsonValue): ArteHistoryMeta {
  if (arteHistoryJson && typeof arteHistoryJson === "object" && !Array.isArray(arteHistoryJson)) {
    return arteHistoryJson as ArteHistoryMeta;
  }
  return {};
}

function getSlidesArray(slidesBlobUrls: Prisma.JsonValue): string[] {
  if (Array.isArray(slidesBlobUrls)) {
    return slidesBlobUrls.filter((s): s is string => typeof s === "string");
  }
  return [];
}

function mapPostModelToResumo(
  pauta: Pauta,
  row: {
    id: string;
    platform: string;
    format: string;
    arteHtml: string | null;
    arteHistoryJson: Prisma.JsonValue;
    slidesBlobUrls: Prisma.JsonValue;
    scheduledAt: Date | null;
    publishedAt: Date | null;
    externalPostId: string | null;
    status: PautaStatus;
    updatedAt: Date;
  }
): PostResumo {
  const meta = getPostMeta(row.arteHistoryJson);
  const canal = oneOf(CANAIS, row.platform) ?? "instagram";
  const formato = oneOf(FORMATOS, row.format) ?? "carrossel";
  const postSlug = meta.postSlug || `${canal}-${formato}`;
  const rel = `${SOCIAL_DIR}/${pauta.slug}/${postSlug}`;
  const serie = oneOf(SERIES, meta.serie) ?? "conteudo";
  const status = mapEnumToLegacyStatus(row.status, meta.legacyStatus);
  const dataPlanejada =
    toDate(meta.dataPlanejada) ?? (row.scheduledAt ? toDate(row.scheduledAt) : null);
  const publicadoEm =
    toDate(meta.publicadoEm) ?? (row.publishedAt ? toDate(row.publishedAt) : null);
  const origemArte =
    oneOf(["ia", "designer"] as const, meta.origemArte) ?? (row.arteHtml ? "ia" : null);
  const link = meta.linkPublicado || row.externalPostId || null;

  const slides = getSlidesArray(row.slidesBlobUrls);
  const versao = meta.versao && meta.versao > 0 ? meta.versao : row.updatedAt.getTime();

  return {
    id: row.id,
    path: rel,
    slug: postSlug,
    pauta,
    canal,
    formato,
    serie,
    status,
    dataPlanejada,
    origemArte,
    publicadoEm,
    link,
    capa: slides[0] ? { path: slides[0], versao } : null,
  };
}

/** Próxima pasta livre para uma Pauta: marketing/social/<data>-<slug>[-2…]. */
export async function novaPastaPauta(
  data: string,
  titulo: string,
  tenantId?: string,
  opcoes?: {
    angulo?: string;
    posts?: { canal: Canal; formato: Formato }[];
    language?: string;
    toneStyle?: string;
    referenceAssetId?: string | null;
  }
): Promise<string> {
  const tid = await resolverTenantId(tenantId);
  const baseSlug = `${data}-${slugify(titulo)}`;
  let pautaSlug = baseSlug;

  for (let i = 1; ; i++) {
    pautaSlug = i === 1 ? baseSlug : `${baseSlug}-${i}`;
    const existing = await prisma.socialPauta.findUnique({
      where: { tenantId_slug: { tenantId: tid, slug: pautaSlug } },
      select: { id: true },
    });
    if (!existing) break;
  }

  const rel = `${SOCIAL_DIR}/${pautaSlug}`;
  const canais = opcoes?.posts
    ? Array.from(new Set(opcoes.posts.map((p) => p.canal)))
    : ["instagram", "linkedin"];

  const fm = joinFrontmatter(
    {
      titulo,
      data_criacao: data,
      objetivo: "autoridade",
      angulo: opcoes?.angulo || "",
      canais,
    },
    `## Briefing\n\nTema: ${titulo}\n${opcoes?.angulo ? `Ângulo: ${opcoes.angulo}\n` : ""}`
  );

  const createdPauta = await prisma.socialPauta.create({
    data: {
      tenantId: tid,
      slug: pautaSlug,
      title: titulo,
      scheduledDate: new Date(data),
      briefingMarkdown: fm,
      referenceAssetId: opcoes?.referenceAssetId ?? null,
      status: PautaStatus.IDEA,
    },
  });

  if (opcoes?.posts && opcoes.posts.length > 0) {
    for (const p of opcoes.posts) {
      const postSlug = `${p.canal}-${p.formato}`;
      await prisma.socialPost.create({
        data: {
          tenantId: tid,
          pautaId: createdPauta.id,
          platform: p.canal,
          format: p.formato,
          language: opcoes.language || "pt-BR",
          toneStyle: opcoes.toneStyle || "Consultivo",
          scriptMarkdown: "",
          captionMarkdown: "",
          scheduledAt: new Date(data),
          status: PautaStatus.SCRIPT_REVIEW,
          slidesBlobUrls: [],
          arteHistoryJson: {
            postSlug,
            serie: "conteudo",
            legacyStatus: "rascunho",
            dataPlanejada: data,
            origemArte: null,
            publicadoEm: null,
            linkPublicado: null,
            pdfUrl: null,
            versao: 0,
            snapshots: [],
          },
        },
      });
    }
  }

  if (process.env.NODE_ENV !== "production") {
    try {
      await fs.mkdir(/*turbopackIgnore: true*/ resolveSafe(rel), { recursive: true });
      await fs.writeFile(
        /*turbopackIgnore: true*/ resolveSafe(`${rel}/pauta.md`),
        fm,
        "utf8"
      );
    } catch {
      // ignore local disk error
    }
  }

  return rel;
}

/** Lê todas as Pautas e Posts do tenant a partir do PostgreSQL. */
export async function listarPosts(tenantId?: string): Promise<IndiceSocial> {
  const tid = await resolverTenantId(tenantId);
  const pautasRows = await prisma.socialPauta.findMany({
    where: { tenantId: tid },
    include: {
      posts: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { slug: "asc" },
  });

  const posts: PostResumo[] = [];
  const invalidos: PostInvalido[] = [];

  for (const pRow of pautasRows) {
    const pauta = parsePautaModel(pRow);
    for (const postRow of pRow.posts) {
      posts.push(mapPostModelToResumo(pauta, postRow));
    }
  }

  posts.sort(
    (a, b) =>
      (a.dataPlanejada ?? "9999").localeCompare(b.dataPlanejada ?? "9999") ||
      a.path.localeCompare(b.path)
  );
  return { posts, invalidos };
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Caminho de um Post a partir dos slugs da URL, recusando qualquer coisa fora do padrão. */
function postRel(pautaSlug: string, postSlug: string): string {
  if (!SLUG.test(pautaSlug) || !SLUG.test(postSlug)) throw new Error("Post não encontrado");
  return `${SOCIAL_DIR}/${pautaSlug}/${postSlug}`;
}

export type Arte = {
  /** Caminhos relativos ao workspace / blob, na ordem dos slides. */
  slides: string[];
  pdf: string | null;
  /** Existe `arte/arte.html`: a Arte veio da IA e pode ser aberta no Editor de Arte. */
  html: boolean;
  /** Conteúdo do `arte.html` armazenado no banco. */
  htmlContent?: string | null;
  /** Timestamp mais recente, usado para furar o cache do navegador quando a Arte muda. */
  versao: number;
};

/** Lista a Arte atual de um Post a partir do caminho relativo ou do banco. */
export async function lerArte(rel: string, tenantId?: string): Promise<Arte> {
  const parts = rel.split("/");
  if (parts.length >= 4 && parts[0] === "marketing" && parts[1] === "social") {
    const pautaSlug = parts[2];
    const postSlug = parts[3];
    const tid = await resolverTenantId(tenantId);
    const pautaRow = await prisma.socialPauta.findUnique({
      where: { tenantId_slug: { tenantId: tid, slug: pautaSlug } },
      include: { posts: true },
    });
    if (pautaRow) {
      const postRow = pautaRow.posts.find((p) => {
        const meta = getPostMeta(p.arteHistoryJson);
        return (meta.postSlug || `${p.platform}-${p.format}`) === postSlug;
      });
      if (postRow) {
        const meta = getPostMeta(postRow.arteHistoryJson);
        const slides = getSlidesArray(postRow.slidesBlobUrls);
        return {
          slides,
          pdf: meta.pdfUrl ?? null,
          html: Boolean(postRow.arteHtml && postRow.arteHtml.trim().length > 0),
          htmlContent: postRow.arteHtml,
          versao: meta.versao && meta.versao > 0 ? meta.versao : postRow.updatedAt.getTime(),
        };
      }
    }
  }

  // Fallback para leitura do disco se não achou no banco
  const dir = resolveSafe(`${rel}/arte`);
  let nomes: string[] = [];
  try {
    nomes = await fs.readdir(/*turbopackIgnore: true*/ dir);
  } catch {
    return { slides: [], pdf: null, html: false, versao: 0 };
  }
  const slides = nomes.filter((n) => /^slide-\d+\.(png|jpe?g)$/i.test(n)).sort();
  const pdf = nomes.find((n) => n.toLowerCase() === "arte.pdf") ?? null;
  let versao = 0;
  for (const n of [...slides, ...(pdf ? [pdf] : [])]) {
    const { mtimeMs } = await fs.stat(/*turbopackIgnore: true*/ path.join(dir, n));
    versao = Math.max(versao, Math.round(mtimeMs));
  }
  return {
    slides: slides.map((n) => `${rel}/arte/${n}`),
    pdf: pdf ? `${rel}/arte/${pdf}` : null,
    html: nomes.includes("arte.html"),
    versao,
  };
}

export type PostCompleto = PostResumo & {
  roteiro: string;
  legenda: string;
  arte: Arte;
  /** Outros Posts da mesma Pauta, para navegar entre Canais. */
  irmaos: { slug: string; canal: Canal; formato: Formato }[];
};

/** Lê um Post com Roteiro e Legenda do PostgreSQL; null se não existir no tenant. */
export async function lerPost(
  pautaSlug: string,
  postSlug: string,
  tenantId?: string
): Promise<PostCompleto | null> {
  if (!SLUG.test(pautaSlug) || !SLUG.test(postSlug)) return null;
  const tid = await resolverTenantId(tenantId);

  const pautaRow = await prisma.socialPauta.findUnique({
    where: { tenantId_slug: { tenantId: tid, slug: pautaSlug } },
    include: {
      posts: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!pautaRow) return null;

  const pauta = parsePautaModel(pautaRow);
  const postRow = pautaRow.posts.find((p) => {
    const meta = getPostMeta(p.arteHistoryJson);
    return (meta.postSlug || `${p.platform}-${p.format}`) === postSlug;
  });
  if (!postRow) return null;

  const resumo = mapPostModelToResumo(pauta, postRow);
  const meta = getPostMeta(postRow.arteHistoryJson);
  const slides = getSlidesArray(postRow.slidesBlobUrls);
  const versao = meta.versao && meta.versao > 0 ? meta.versao : postRow.updatedAt.getTime();

  const irmaos: PostCompleto["irmaos"] = pautaRow.posts.map((p) => {
    const m = getPostMeta(p.arteHistoryJson);
    const canal = oneOf(CANAIS, p.platform) ?? "instagram";
    const formato = oneOf(FORMATOS, p.format) ?? "carrossel";
    return {
      slug: m.postSlug || `${canal}-${formato}`,
      canal,
      formato,
    };
  });

  return {
    ...resumo,
    roteiro: (postRow.scriptMarkdown ?? "").trim(),
    legenda: (postRow.captionMarkdown ?? "").trim(),
    arte: {
      slides,
      pdf: meta.pdfUrl ?? null,
      html: Boolean(postRow.arteHtml && postRow.arteHtml.trim().length > 0),
      htmlContent: postRow.arteHtml,
      versao,
    },
    irmaos,
  };
}

export type AtualizacaoPost = {
  status?: Status;
  dataPlanejada?: string | null;
  roteiro?: string;
  legenda?: string;
  /** Link do post publicado (vazio remove). */
  link?: string | null;
  /** Só o servidor muda: ao gerar (ia) ou receber por upload (designer). */
  origemArte?: "ia" | "designer";
  arteHtml?: string | null;
  slidesBlobUrls?: string[];
  pdfUrl?: string | null;
  serie?: Serie;
};

/** Caminho de um Post já validado, para módulos de servidor (render, upload). */
export function caminhoPost(pautaSlug: string, postSlug: string): string {
  return postRel(pautaSlug, postSlug);
}

/** Atualiza Status, data planejada, Roteiro, Legenda e Arte de um Post no PostgreSQL. */
export async function atualizarPost(
  pautaSlug: string,
  postSlug: string,
  mudancas: AtualizacaoPost,
  tenantId?: string
): Promise<void> {
  const rel = postRel(pautaSlug, postSlug);
  const tid = await resolverTenantId(tenantId);

  const pautaRow = await prisma.socialPauta.findUnique({
    where: { tenantId_slug: { tenantId: tid, slug: pautaSlug } },
    include: { posts: true },
  });
  if (!pautaRow) throw new Error("Post não encontrado");

  const postRow = pautaRow.posts.find((p) => {
    const meta = getPostMeta(p.arteHistoryJson);
    return (meta.postSlug || `${p.platform}-${p.format}`) === postSlug;
  });
  if (!postRow) throw new Error("Post não encontrado");

  if (mudancas.status !== undefined && !STATUSES.includes(mudancas.status)) {
    throw new Error("status inválido");
  }
  if (mudancas.dataPlanejada && !toDate(mudancas.dataPlanejada)) {
    throw new Error("data inválida");
  }

  const meta: ArteHistoryMeta = {
    ...getPostMeta(postRow.arteHistoryJson),
    postSlug,
  };

  if (mudancas.serie !== undefined) meta.serie = mudancas.serie;

  let publishedAt = postRow.publishedAt;
  if (mudancas.status !== undefined) {
    meta.legacyStatus = mudancas.status;
    if (mudancas.status === "publicado" && !meta.publicadoEm) {
      const hoje = new Date().toISOString().slice(0, 10);
      meta.publicadoEm = hoje;
      publishedAt = new Date(hoje);
    }
  }

  let scheduledAt = postRow.scheduledAt;
  if (mudancas.dataPlanejada !== undefined) {
    meta.dataPlanejada = mudancas.dataPlanejada || null;
    scheduledAt = mudancas.dataPlanejada ? new Date(mudancas.dataPlanejada) : null;
  }

  if (mudancas.origemArte !== undefined) {
    meta.origemArte = mudancas.origemArte;
  }

  let externalPostId = postRow.externalPostId;
  if (mudancas.link !== undefined) {
    const link = mudancas.link?.trim() || null;
    if (link && !linkDoCanal(link)) {
      throw new Error(
        "link inválido: cole o endereço do post no Instagram ou no LinkedIn"
      );
    }
    meta.linkPublicado = link;
    externalPostId = link;
  }

  if (mudancas.pdfUrl !== undefined) {
    meta.pdfUrl = mudancas.pdfUrl;
  }

  let arteHtml = postRow.arteHtml;
  if (mudancas.arteHtml !== undefined) {
    if (postRow.arteHtml && postRow.arteHtml.trim()) {
      const snapshots = Array.isArray(meta.snapshots) ? [...meta.snapshots] : [];
      snapshots.push({
        timestamp: new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19),
        slides: getSlidesArray(postRow.slidesBlobUrls),
        hasHtml: true,
        htmlContent: postRow.arteHtml,
      });
      meta.snapshots = snapshots;
    }
    arteHtml = mudancas.arteHtml;
    meta.versao = Date.now();
  }

  let slidesBlobUrls = getSlidesArray(postRow.slidesBlobUrls);
  if (mudancas.slidesBlobUrls !== undefined) {
    slidesBlobUrls = mudancas.slidesBlobUrls;
    meta.versao = Date.now();
  }

  const effectiveStatus = mapEnumToLegacyStatus(postRow.status, meta.legacyStatus);

  await prisma.socialPost.update({
    where: { id: postRow.id },
    data: {
      ...(mudancas.roteiro !== undefined ? { scriptMarkdown: mudancas.roteiro.trim() } : {}),
      ...(mudancas.legenda !== undefined ? { captionMarkdown: mudancas.legenda.trim() } : {}),
      arteHtml,
      slidesBlobUrls: slidesBlobUrls as Prisma.InputJsonValue,
      arteHistoryJson: meta as Prisma.InputJsonValue,
      scheduledAt,
      publishedAt,
      externalPostId,
      status: mapLegacyStatusToEnum(effectiveStatus),
    },
  });

  // Em desenvolvimento, sincroniza também nos arquivos locais se existirem
  if (process.env.NODE_ENV !== "production") {
    try {
      const postFile = resolveSafe(`${rel}/post.md`);
      const text = await fs.readFile(postFile, "utf8").catch(() => null);
      if (text !== null) {
        const { data, body } = splitFrontmatter(text);
        if (mudancas.status !== undefined) {
          data.status = mudancas.status;
          if (mudancas.status === "publicado" && !data.publicado_em) {
            data.publicado_em = meta.publicadoEm;
          }
        }
        if (mudancas.dataPlanejada !== undefined) {
          data.data_planejada = mudancas.dataPlanejada || null;
        }
        if (mudancas.origemArte !== undefined) {
          data.origem_arte = mudancas.origemArte;
        }
        if (mudancas.link !== undefined) {
          data.link_publicado = meta.linkPublicado;
        }
        const novoCorpo =
          mudancas.roteiro !== undefined ? `${mudancas.roteiro.trim()}\n` : body;
        await fs.writeFile(postFile, joinFrontmatter(data, novoCorpo), "utf8");
      }
      if (mudancas.legenda !== undefined) {
        await fs.writeFile(
          resolveSafe(`${rel}/legenda.md`),
          `${mudancas.legenda.trim()}\n`,
          "utf8"
        );
      }
    } catch {
      // ignora se arquivo local não existir
    }
  }
}

/** Lixeira do Social: o Quadro ignora (não tem pauta.md) e o TatuOS não versiona (.gitignore). */
export const LIXEIRA_DIR = `${SOCIAL_DIR}/_lixeira`;

/**
 * Exclui um Post do banco (e move a pasta para a Lixeira em dev). Com `pautaInteira`, ou quando é o último Post
 * da Pauta, exclui a Pauta toda. Devolve o que foi excluído.
 */
export async function excluirPost(
  pautaSlug: string,
  postSlug: string,
  { pautaInteira = false } = {},
  tenantId?: string
): Promise<{ excluido: "post" | "pauta"; destino: string }> {
  const rel = postRel(pautaSlug, postSlug);
  const tid = await resolverTenantId(tenantId);

  const pautaRow = await prisma.socialPauta.findUnique({
    where: { tenantId_slug: { tenantId: tid, slug: pautaSlug } },
    include: { posts: true },
  });
  if (!pautaRow) throw new Error("Post não encontrado");

  const postRow = pautaRow.posts.find((p) => {
    const meta = getPostMeta(p.arteHistoryJson);
    return (meta.postSlug || `${p.platform}-${p.format}`) === postSlug;
  });
  if (!postRow) throw new Error("Post não encontrado");

  const outros = pautaRow.posts.filter((p) => p.id !== postRow.id);
  const excluido = pautaInteira || outros.length === 0 ? "pauta" : "post";

  const carimbo = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const destino = `${LIXEIRA_DIR}/${carimbo}_${pautaSlug}${excluido === "post" ? `_${postSlug}` : ""}`;

  if (excluido === "pauta") {
    await prisma.socialPauta.delete({ where: { id: pautaRow.id } });
  } else {
    await prisma.socialPost.delete({ where: { id: postRow.id } });
  }

  if (process.env.NODE_ENV !== "production") {
    try {
      const pautaDir = resolveSafe(`${SOCIAL_DIR}/${pautaSlug}`);
      await fs.mkdir(/*turbopackIgnore: true*/ resolveSafe(LIXEIRA_DIR), { recursive: true });
      await fs.rename(
        /*turbopackIgnore: true*/ excluido === "pauta" ? pautaDir : resolveSafe(rel),
        resolveSafe(destino)
      );
    } catch {
      // ignora se pasta não existir no disco
    }
  }

  return { excluido, destino };
}

// ---------- Instagram: links de posts publicados ----------

const IG_POST = /^https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:p|reel|tv)\/([\w-]{5,})/i;
const LINKEDIN_POST = /^https?:\/\/(?:[\w-]+\.)?linkedin\.com\/(?:posts|feed\/update)\//i;

/** O link é de um post do Instagram ou do LinkedIn? */
export function linkDoCanal(url: string): boolean {
  return IG_POST.test(url) || LINKEDIN_POST.test(url);
}

/** Código do post do Instagram (o "ABC123" de instagram.com/p/ABC123/), ou null. */
export function codigoInstagram(url: string): string | null {
  return IG_POST.exec(url.trim())?.[1] ?? null;
}
