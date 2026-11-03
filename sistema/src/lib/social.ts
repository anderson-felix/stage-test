import fs from "node:fs/promises";
import path from "node:path";
import { joinFrontmatter, slugify, splitFrontmatter, type Frontmatter } from "./frontmatter";
import { resolveSafe } from "./workspace";

/** Pasta das Pautas dentro do workspace (ver docs/BACKEND.md). */
export const SOCIAL_DIR = "marketing/social";

export const STATUSES = ["rascunho", "aprovado", "em-design", "pronto", "publicado"] as const;
export const CANAIS = ["instagram", "linkedin"] as const;
export const FORMATOS = ["carrossel", "post-unico", "story"] as const;
export const SERIES = ["cultura-em-acao", "dado", "na-midia", "socios", "evento", "conteudo"] as const;

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
  slug: string;
  titulo: string;
  angulo: string;
  exemplo: boolean;
};

export type PostResumo = {
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


/** YAML converte datas sem aspas em Date; normaliza para AAAA-MM-DD. */
function toDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return null;
}

function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return list.includes(value as T) ? (value as T) : null;
}

async function readIfExists(full: string): Promise<string | null> {
  try {
    return await fs.readFile(/*turbopackIgnore: true*/ full, "utf8");
  } catch {
    return null;
  }
}

async function subdirs(full: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(/*turbopackIgnore: true*/ full, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

function parsePost(rel: string, slug: string, pauta: Pauta, data: Frontmatter): PostResumo | PostInvalido {
  const canal = oneOf(CANAIS, data.canal);
  const formato = oneOf(FORMATOS, data.formato);
  const serie = oneOf(SERIES, data.serie);
  const status = oneOf(STATUSES, data.status);
  const problemas = [
    !canal && `canal inválido (${String(data.canal)})`,
    !formato && `formato inválido (${String(data.formato)})`,
    canal && formato && !FORMATOS_POR_CANAL[canal].includes(formato) && `${canal} não aceita ${formato}`,
    !serie && `série inválida (${String(data.serie)})`,
    !status && `status inválido (${String(data.status)})`,
  ].filter(Boolean);
  if (problemas.length || !canal || !formato || !serie || !status) {
    return { path: rel, problema: problemas.join("; ") };
  }
  return {
    path: rel,
    slug,
    pauta,
    canal,
    formato,
    serie,
    status,
    dataPlanejada: toDate(data.data_planejada),
    origemArte: oneOf(["ia", "designer"] as const, data.origem_arte),
    publicadoEm: toDate(data.publicado_em),
    link: typeof data.link_publicado === "string" && data.link_publicado ? data.link_publicado : null,
  };
}

/** Próxima pasta livre para uma Pauta: marketing/social/<data>-<slug>[-2…]. */
export async function novaPastaPauta(data: string, titulo: string): Promise<string> {
  const base = `${SOCIAL_DIR}/${data}-${slugify(titulo)}`;
  for (let i = 1; ; i++) {
    const rel = i === 1 ? base : `${base}-${i}`;
    try {
      await fs.access(/*turbopackIgnore: true*/ resolveSafe(rel));
    } catch {
      return rel;
    }
  }
}

/** Lê todas as Pautas e Posts do workspace a partir do frontmatter. */
export async function listarPosts(): Promise<IndiceSocial> {
  const root = resolveSafe(SOCIAL_DIR);
  const posts: PostResumo[] = [];
  const invalidos: PostInvalido[] = [];

  for (const pautaSlug of await subdirs(root)) {
    const pautaDir = path.join(root, pautaSlug);
    const pautaText = await readIfExists(path.join(pautaDir, "pauta.md"));
    if (pautaText === null) continue;

    let pauta: Pauta;
    try {
      pauta = parsePauta(pautaSlug, pautaText);
    } catch (err) {
      invalidos.push({ path: `${SOCIAL_DIR}/${pautaSlug}/pauta.md`, problema: `YAML inválido: ${(err as Error).message}` });
      continue;
    }

    for (const postSlug of await subdirs(pautaDir)) {
      const rel = `${SOCIAL_DIR}/${pautaSlug}/${postSlug}`;
      const postText = await readIfExists(path.join(pautaDir, postSlug, "post.md"));
      if (postText === null) continue;
      try {
        const result = parsePost(rel, postSlug, pauta, splitFrontmatter(postText).data);
        if ("problema" in result) invalidos.push(result);
        else {
          const arte = await lerArte(rel);
          posts.push({ ...result, capa: arte.slides[0] ? { path: arte.slides[0], versao: arte.versao } : null });
        }
      } catch (err) {
        invalidos.push({ path: `${rel}/post.md`, problema: `YAML inválido: ${(err as Error).message}` });
      }
    }
  }

  posts.sort((a, b) => (a.dataPlanejada ?? "9999").localeCompare(b.dataPlanejada ?? "9999") || a.path.localeCompare(b.path));
  return { posts, invalidos };
}

function parsePauta(slug: string, text: string): Pauta {
  const { data } = splitFrontmatter(text);
  return {
    slug,
    titulo: typeof data.titulo === "string" ? data.titulo : slug,
    angulo: typeof data.angulo === "string" ? data.angulo : "",
    exemplo: data.exemplo === true,
  };
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** Caminho de um Post a partir dos slugs da URL, recusando qualquer coisa fora do padrão. */
function postRel(pautaSlug: string, postSlug: string): string {
  if (!SLUG.test(pautaSlug) || !SLUG.test(postSlug)) throw new Error("Post não encontrado");
  return `${SOCIAL_DIR}/${pautaSlug}/${postSlug}`;
}

export type Arte = {
  /** Caminhos relativos ao workspace, na ordem dos slides. */
  slides: string[];
  pdf: string | null;
  /** Existe `arte/arte.html`: a Arte veio da IA e pode ser aberta no Editor de Arte. */
  html: boolean;
  /** mtime mais recente, usado para furar o cache do navegador quando a Arte muda. */
  versao: number;
};

/** Lista a Arte atual de um Post (slide-NN.png/jpg e arte.pdf em arte/). */
export async function lerArte(rel: string): Promise<Arte> {
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

/** Lê um Post com Roteiro e Legenda; null se não existir ou estiver fora do padrão. */
export async function lerPost(pautaSlug: string, postSlug: string): Promise<PostCompleto | null> {
  let rel: string;
  try {
    rel = postRel(pautaSlug, postSlug);
  } catch {
    return null;
  }
  const pautaText = await readIfExists(resolveSafe(`${SOCIAL_DIR}/${pautaSlug}/pauta.md`));
  const postText = await readIfExists(resolveSafe(`${rel}/post.md`));
  if (pautaText === null || postText === null) return null;

  const pauta = parsePauta(pautaSlug, pautaText);
  const { data, body } = splitFrontmatter(postText);
  const resumo = parsePost(rel, postSlug, pauta, data);
  if ("problema" in resumo) return null;

  const irmaos: PostCompleto["irmaos"] = [];
  for (const slug of await subdirs(resolveSafe(`${SOCIAL_DIR}/${pautaSlug}`))) {
    const text = await readIfExists(resolveSafe(`${SOCIAL_DIR}/${pautaSlug}/${slug}/post.md`));
    if (text === null) continue;
    try {
      const r = parsePost(`${SOCIAL_DIR}/${pautaSlug}/${slug}`, slug, pauta, splitFrontmatter(text).data);
      if (!("problema" in r)) irmaos.push({ slug, canal: r.canal, formato: r.formato });
    } catch {
      // Post irmão com YAML quebrado: o Quadro já avisa; aqui só não aparece na navegação.
    }
  }

  return {
    ...resumo,
    publicadoEm: toDate(data.publicado_em),
    roteiro: body.trim(),
    legenda: ((await readIfExists(resolveSafe(`${rel}/legenda.md`))) ?? "").trim(),
    arte: await lerArte(rel),
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
};

/** Caminho de um Post já validado, para módulos de servidor (render, upload). */
export function caminhoPost(pautaSlug: string, postSlug: string): string {
  return postRel(pautaSlug, postSlug);
}

/** Atualiza Status, data planejada, Roteiro e/ou Legenda de um Post, mantendo o resto do frontmatter. */
export async function atualizarPost(pautaSlug: string, postSlug: string, mudancas: AtualizacaoPost): Promise<void> {
  const rel = postRel(pautaSlug, postSlug);
  const postFile = resolveSafe(`${rel}/post.md`);
  const text = await readIfExists(postFile);
  if (text === null) throw new Error("Post não encontrado");

  if (mudancas.status !== undefined && !STATUSES.includes(mudancas.status)) throw new Error("status inválido");
  if (mudancas.dataPlanejada && !toDate(mudancas.dataPlanejada)) throw new Error("data inválida");

  const { data, body } = splitFrontmatter(text);
  if (mudancas.status !== undefined) {
    data.status = mudancas.status;
    if (mudancas.status === "publicado" && !data.publicado_em) data.publicado_em = new Date().toISOString().slice(0, 10);
  }
  if (mudancas.dataPlanejada !== undefined) data.data_planejada = mudancas.dataPlanejada || null;
  if (mudancas.origemArte !== undefined) data.origem_arte = mudancas.origemArte;
  if (mudancas.link !== undefined) {
    const link = mudancas.link?.trim() || null;
    if (link && !linkDoCanal(link)) throw new Error("link inválido: cole o endereço do post no Instagram ou no LinkedIn");
    data.link_publicado = link;
  }
  const novoCorpo = mudancas.roteiro !== undefined ? `${mudancas.roteiro.trim()}\n` : body;

  await fs.writeFile(/*turbopackIgnore: true*/ postFile, joinFrontmatter(data, novoCorpo), "utf8");
  if (mudancas.legenda !== undefined) {
    await fs.writeFile(/*turbopackIgnore: true*/ resolveSafe(`${rel}/legenda.md`), `${mudancas.legenda.trim()}\n`, "utf8");
  }
}

/** Lixeira do Social: o Quadro ignora (não tem pauta.md) e o TatuOS não versiona (.gitignore). */
export const LIXEIRA_DIR = `${SOCIAL_DIR}/_lixeira`;

/**
 * Exclui um Post movendo a pasta para a Lixeira. Com `pautaInteira`, ou quando é o último Post
 * da Pauta, move a Pauta toda. Devolve o que foi excluído.
 */
export async function excluirPost(
  pautaSlug: string,
  postSlug: string,
  { pautaInteira = false } = {},
): Promise<{ excluido: "post" | "pauta"; destino: string }> {
  const rel = postRel(pautaSlug, postSlug);
  if ((await readIfExists(resolveSafe(`${rel}/post.md`))) === null) throw new Error("Post não encontrado");

  const pautaDir = resolveSafe(`${SOCIAL_DIR}/${pautaSlug}`);
  const outros = [];
  for (const slug of await subdirs(pautaDir)) {
    if (slug !== postSlug && (await readIfExists(path.join(pautaDir, slug, "post.md"))) !== null) outros.push(slug);
  }
  const excluido = pautaInteira || outros.length === 0 ? "pauta" : "post";

  const carimbo = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const destino = `${LIXEIRA_DIR}/${carimbo}_${pautaSlug}${excluido === "post" ? `_${postSlug}` : ""}`;
  await fs.mkdir(/*turbopackIgnore: true*/ resolveSafe(LIXEIRA_DIR), { recursive: true });
  await fs.rename(/*turbopackIgnore: true*/ excluido === "pauta" ? pautaDir : resolveSafe(rel), resolveSafe(destino));
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
