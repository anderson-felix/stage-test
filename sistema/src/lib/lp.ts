import fs from "node:fs/promises";
import path from "node:path";
import { CAMPANHAS_DIR, SERVICOS, type Servico } from "./ads";
import { joinFrontmatter, slugify, splitFrontmatter } from "./frontmatter";
import { resolveSafe } from "./workspace";

/** Pasta das Landing Pages dentro do workspace (ver docs/BACKEND.md). */
export const LP_DIR = "marketing/landing-pages";
/** Logo copiado para cada LP, para a pasta poder ser publicada sozinha. */
const LOGO_ORIGEM = "marca/assets/logo/Logotipo_Stage.png";

export const STATUS_LP = ["rascunho", "aprovada", "publicada"] as const;
export type StatusLP = (typeof STATUS_LP)[number];

/** Para que serve a LP: levar o clique de uma Campanha de Ads, ou ser uma página/matéria do site (orgânico). */
export const FINALIDADES_LP = ["campanha", "site"] as const;
export type FinalidadeLP = (typeof FINALIDADES_LP)[number];

export type LandingPage = {
  slug: string;
  path: string;
  titulo: string;
  servico: Servico;
  finalidade: FinalidadeLP;
  campanha: string | null;
  status: StatusLP;
  urlPublicada: string;
  criadaEm: string | null;
  briefing: string;
  /** mtime do index.html (0 se ainda não foi gerado), para furar o cache do preview. */
  versao: number;
};

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function lpRel(slug: string): string {
  if (!SLUG.test(slug)) throw new Error("LP não encontrada");
  return `${LP_DIR}/${slug}`;
}

async function readIfExists(full: string): Promise<string | null> {
  try {
    return await fs.readFile(/*turbopackIgnore: true*/ full, "utf8");
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));

export async function lerLP(slug: string): Promise<LandingPage | null> {
  let rel: string;
  try {
    rel = lpRel(slug);
  } catch {
    return null;
  }
  const text = await readIfExists(resolveSafe(`${rel}/lp.md`));
  if (text === null) return null;
  const { data, body } = splitFrontmatter(text);
  let versao = 0;
  try {
    versao = Math.round((await fs.stat(/*turbopackIgnore: true*/ resolveSafe(`${rel}/index.html`))).mtimeMs);
  } catch {
    // ainda não gerada
  }
  const campanha = str(data.campanha);
  // LPs antigas não têm o campo: nasceram para mídia paga
  const finalidade: FinalidadeLP = data.finalidade === "site" ? "site" : "campanha";
  return {
    slug,
    path: rel,
    titulo: str(data.titulo) || slug,
    servico: SERVICOS.find((s) => s === data.servico) ?? "institucional",
    finalidade,
    campanha: finalidade === "campanha" && campanha && SLUG.test(campanha) ? campanha : null,
    status: STATUS_LP.find((s) => s === data.status) ?? "rascunho",
    urlPublicada: str(data.url_publicada),
    criadaEm: str(data.criada_em) || null,
    briefing: body.replace(/^## Briefing\s*/i, "").trim(),
    versao,
  };
}

export async function listarLPs(): Promise<LandingPage[]> {
  let nomes: string[] = [];
  try {
    const entries = await fs.readdir(/*turbopackIgnore: true*/ resolveSafe(LP_DIR), { withFileTypes: true });
    nomes = entries.filter((e) => e.isDirectory() && SLUG.test(e.name)).map((e) => e.name);
  } catch {
    return [];
  }
  const lista = (await Promise.all(nomes.map(lerLP))).filter((l): l is LandingPage => l !== null);
  return lista.sort((a, b) => b.slug.localeCompare(a.slug));
}

export type NovaLP = { titulo: string; servico: Servico; finalidade: FinalidadeLP; campanha: string | null; briefing: string };

async function conferirCampanha(slug: string): Promise<void> {
  if (!SLUG.test(slug) || (await readIfExists(resolveSafe(`${CAMPANHAS_DIR}/${slug}/campanha.md`))) === null) {
    throw new Error("Campanha não encontrada");
  }
}

/** Cria a pasta com lp.md e uma cópia do logo; devolve o slug (sem data: vira o caminho público). */
export async function criarLP(n: NovaLP): Promise<string> {
  if (!FINALIDADES_LP.includes(n.finalidade)) throw new Error("finalidade inválida");
  // Página do site não fica atrelada a Campanha
  const campanha = n.finalidade === "campanha" ? n.campanha : null;
  if (campanha) await conferirCampanha(campanha);
  const base = slugify(n.titulo);
  let slug = base;
  for (let i = 2; (await readIfExists(resolveSafe(`${LP_DIR}/${slug}/lp.md`))) !== null; i++) slug = `${base}-${i}`;
  const rel = lpRel(slug);
  const dir = resolveSafe(rel);
  await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
  await fs.copyFile(/*turbopackIgnore: true*/ resolveSafe(LOGO_ORIGEM), path.join(dir, "logo.png"));
  const data = {
    titulo: n.titulo,
    servico: n.servico,
    finalidade: n.finalidade,
    campanha,
    status: "rascunho",
    url_publicada: null,
    criada_em: new Date().toISOString().slice(0, 10),
  };
  const corpo = `## Briefing\n\n${n.briefing.trim() || "(sem briefing: usar a memória, a estratégia e o serviço escolhido)"}\n`;
  await fs.writeFile(/*turbopackIgnore: true*/ path.join(dir, "lp.md"), joinFrontmatter(data, corpo), "utf8");
  return slug;
}

export type MudancaLP = { status?: StatusLP; urlPublicada?: string; finalidade?: FinalidadeLP; campanha?: string | null };

export async function atualizarLP(slug: string, m: MudancaLP): Promise<void> {
  const file = resolveSafe(`${lpRel(slug)}/lp.md`);
  const text = await readIfExists(file);
  if (text === null) throw new Error("LP não encontrada");
  if (m.status !== undefined && !STATUS_LP.includes(m.status)) throw new Error("status inválido");
  if (m.urlPublicada && !/^https:\/\/\S+$/.test(m.urlPublicada)) throw new Error("URL precisa começar com https://");
  if (m.finalidade !== undefined && !FINALIDADES_LP.includes(m.finalidade)) throw new Error("finalidade inválida");
  if (m.campanha) await conferirCampanha(m.campanha);
  const { data, body } = splitFrontmatter(text);
  if (m.status !== undefined) data.status = m.status;
  if (m.urlPublicada !== undefined) data.url_publicada = m.urlPublicada || null;
  if (m.finalidade !== undefined) data.finalidade = m.finalidade;
  if (m.campanha !== undefined) data.campanha = m.campanha;
  // Atrelar uma Campanha faz da LP uma LP de Ads; página do site não fica atrelada a Campanha
  if (m.campanha) data.finalidade = "campanha";
  if (data.finalidade === "site") data.campanha = null;
  await fs.writeFile(/*turbopackIgnore: true*/ file, joinFrontmatter(data, body), "utf8");
}

/** Caminho absoluto de um arquivo da LP para o preview (só index.html e imagens da própria pasta). */
export function arquivoDaLP(slug: string, arquivo: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*\.(html|png|jpe?g|svg|webp)$/i.test(arquivo)) throw new Error("arquivo não permitido");
  return resolveSafe(`${lpRel(slug)}/${arquivo}`);
}

/** index.html com o logo embutido (data URI): um arquivo só, pronto para publicar em qualquer lugar. */
export async function htmlAutocontido(slug: string): Promise<string> {
  const html = await readIfExists(arquivoDaLP(slug, "index.html"));
  if (html === null) throw new Error("a LP ainda não foi gerada");
  const logo = await fs.readFile(/*turbopackIgnore: true*/ arquivoDaLP(slug, "logo.png")).catch(() => null);
  if (!logo) return html;
  const dataUri = `data:image/png;base64,${logo.toString("base64")}`;
  return html.replace(/(["'(])(\.\/)?logo\.png(["')])/g, `$1${dataUri}$3`);
}
