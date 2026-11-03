import fs from "node:fs/promises";
import path from "node:path";
import { decodeTexto, detectarSeparador, parseCsv, toCsv } from "./csv";
import { joinFrontmatter, slugify, splitFrontmatter } from "./frontmatter";
import { resolveSafe } from "./workspace";

/** Pasta das Campanhas dentro do workspace (ver docs/BACKEND.md). */
export const CAMPANHAS_DIR = "marketing/ads/campanhas";

export const SERVICOS = ["technology", "strategy-business", "experience-design", "people-development", "institucional"] as const;
export const STATUS_CAMPANHA = ["rascunho", "pronta", "ativa", "encerrada"] as const;

export type Servico = (typeof SERVICOS)[number];
export type StatusCampanha = (typeof STATUS_CAMPANHA)[number];

export type PalavraChave = {
  palavra: string;
  volume: string;
  volumeMin: number | null;
  volumeMax: number | null;
  concorrencia: string;
  lanceMin: number | null;
  lanceMax: number | null;
};

export type CampanhaResumo = {
  slug: string;
  path: string;
  titulo: string;
  servico: Servico;
  status: StatusCampanha;
  orcamentoDiario: number | null;
  regiao: string;
  lpUrl: string;
  criadaEm: string | null;
  temPesquisa: boolean;
  temSementes: boolean;
  montada: boolean;
};

export type Anuncio = { headlines: string[]; descriptions: string[]; finalUrl: string; path1: string; path2: string };
export type GrupoAnuncios = {
  nome: string;
  palavras: { texto: string; tipo: string }[];
  negativas: string[];
  anuncios: Anuncio[];
};

export type CampanhaCompleta = CampanhaResumo & {
  corpo: string;
  pesquisa: PalavraChave[];
  sementes: string | null;
  grupos: GrupoAnuncios[];
  negativasGlobais: string[];
  /** Arquivos de ads-editor/ para download (caminhos relativos ao workspace). */
  arquivos: string[];
};

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function campanhaRel(slug: string): string {
  if (!SLUG.test(slug)) throw new Error("Campanha não encontrada");
  return `${CAMPANHAS_DIR}/${slug}`;
}

async function readIfExists(full: string): Promise<string | null> {
  try {
    return await fs.readFile(/*turbopackIgnore: true*/ full, "utf8");
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() && !isNaN(Number(v)) ? Number(v) : null);

async function resumo(slug: string): Promise<CampanhaResumo | null> {
  const rel = campanhaRel(slug);
  const text = await readIfExists(resolveSafe(`${rel}/campanha.md`));
  if (text === null) return null;
  const { data } = splitFrontmatter(text);
  const existe = async (p: string) => (await readIfExists(resolveSafe(`${rel}/${p}`))) !== null;
  return {
    slug,
    path: rel,
    titulo: str(data.titulo) || slug,
    servico: SERVICOS.find((s) => s === data.servico) ?? "institucional",
    status: STATUS_CAMPANHA.find((s) => s === data.status) ?? "rascunho",
    orcamentoDiario: num(data.orcamento_diario),
    regiao: str(data.regiao) || "Brazil",
    lpUrl: str(data.lp_url),
    criadaEm: str(data.criada_em) || null,
    temPesquisa: await existe("pesquisa/palavras-chave.csv"),
    temSementes: await existe("pesquisa/sementes.md"),
    montada: await existe("ads-editor/keywords.csv"),
  };
}

export async function listarCampanhas(): Promise<CampanhaResumo[]> {
  let nomes: string[] = [];
  try {
    const entries = await fs.readdir(/*turbopackIgnore: true*/ resolveSafe(CAMPANHAS_DIR), { withFileTypes: true });
    nomes = entries.filter((e) => e.isDirectory() && SLUG.test(e.name)).map((e) => e.name);
  } catch {
    return [];
  }
  const lista = (await Promise.all(nomes.map(resumo))).filter((c): c is CampanhaResumo => c !== null);
  return lista.sort((a, b) => b.slug.localeCompare(a.slug));
}

export type NovaCampanha = {
  titulo: string;
  servico: Servico;
  objetivo: string;
  orcamentoDiario: number | null;
  regiao: string;
  briefing: string;
};

/** Cria a pasta e o campanha.md; devolve o slug. */
export async function criarCampanha(c: NovaCampanha): Promise<string> {
  const hoje = new Date().toISOString().slice(0, 10);
  const base = `${hoje}-${slugify(c.titulo)}`;
  let slug = base;
  for (let i = 2; (await readIfExists(resolveSafe(`${CAMPANHAS_DIR}/${slug}/campanha.md`))) !== null; i++) slug = `${base}-${i}`;
  const rel = campanhaRel(slug);
  await fs.mkdir(/*turbopackIgnore: true*/ resolveSafe(`${rel}/pesquisa`), { recursive: true });
  const data = {
    titulo: c.titulo,
    servico: c.servico,
    objetivo: c.objetivo || "formulario",
    orcamento_diario: c.orcamentoDiario,
    regiao: c.regiao || "Brazil",
    lp_url: null,
    status: "rascunho",
    criada_em: hoje,
  };
  const corpo = `## Briefing\n\n${c.briefing.trim() || "(sem briefing: usar a estratégia e o serviço escolhido)"}\n`;
  await fs.writeFile(/*turbopackIgnore: true*/ resolveSafe(`${rel}/campanha.md`), joinFrontmatter(data, corpo), "utf8");
  return slug;
}

// ---------- Planejador de palavras-chave ----------

/** "1 mil" → 1000 · "10K" → 10000 · "1,5 mi" → 1500000 · "R$ 3,50" → 3.5 */
function lerNumero(s: string): number | null {
  const t = s.toLowerCase().replace(/r\$|\s/g, "");
  if (!t || t === "-" || t === "--") return null;
  const m = /^([\d.,]+)(mil|k|mi|m)?$/.exec(t);
  if (!m) return null;
  let n = m[1];
  // "1.000" (milhar pt-BR) vs "3.50" (decimal en): ponto seguido de exatamente 3 dígitos = milhar
  n = /\.\d{3}(\D|$)/.test(n) ? n.replace(/\./g, "") : n;
  n = n.replace(",", ".");
  const base = Number(n);
  if (isNaN(base)) return null;
  const mult = m[2] === "mil" || m[2] === "k" ? 1e3 : m[2] === "mi" || m[2] === "m" ? 1e6 : 1;
  return Math.round(base * mult * 100) / 100;
}

function lerFaixa(s: string): [number | null, number | null] {
  const partes = s.split(/\s*[–—-]\s*/).filter(Boolean);
  if (partes.length === 2) return [lerNumero(partes[0]), lerNumero(partes[1])];
  const n = lerNumero(s);
  return [n, n];
}

/** Lê o export do Planejador do Google Ads (CSV/TSV, UTF-8 ou UTF-16, PT ou EN) ou uma lista simples. */
export function normalizarPlanejador(buf: Uint8Array): PalavraChave[] {
  const texto = decodeTexto(buf);
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  const ehCabecalho = (cells: string[]) => cells.some((c) => /^(keyword|palavra[- ]chave|palavras[- ]chave)$/i.test(c.trim()));
  const idxLinha = linhas.slice(0, 20).findIndex((l) => ehCabecalho(l.split(detectarSeparador(l))));

  const vistas = new Set<string>();
  const unico = (p: PalavraChave) => {
    const k = p.palavra.toLowerCase();
    if (!p.palavra || vistas.has(k)) return false;
    vistas.add(k);
    return true;
  };

  if (idxLinha < 0) {
    // Lista simples: um termo por linha (primeira coluna)
    return linhas
      .map((l) => l.split(detectarSeparador(l))[0].trim())
      .map((palavra) => ({ palavra, volume: "", volumeMin: null, volumeMax: null, concorrencia: "", lanceMin: null, lanceMax: null }))
      .filter(unico);
  }

  const sep = detectarSeparador(linhas[idxLinha]);
  const rows = parseCsv(linhas.slice(idxLinha).join("\n"), sep);
  const head = rows[0].map((h) => h.trim());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iPalavra = col(/^(keyword|palavra[- ]chave|palavras[- ]chave)$/i);
  const iVolume = col(/avg\.? monthly searches|m[eé]dia de pesquisas mensais|pesquisas mensais/i);
  const iConc = col(/^(competition|concorr[eê]ncia)$/i);
  const iLanceMin = col(/low range|mais baixo/i);
  const iLanceMax = col(/high range|mais alto/i);
  const cel = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

  return rows
    .slice(1)
    .map((r) => {
      const volume = cel(r, iVolume);
      const [volumeMin, volumeMax] = lerFaixa(volume);
      return {
        palavra: cel(r, iPalavra),
        volume,
        volumeMin,
        volumeMax,
        concorrencia: cel(r, iConc),
        lanceMin: lerNumero(cel(r, iLanceMin)),
        lanceMax: lerNumero(cel(r, iLanceMax)),
      };
    })
    .filter(unico);
}

const PESQUISA_COLUNAS = ["palavra", "volume", "volume_min", "volume_max", "concorrencia", "lance_min", "lance_max"];

/** Guarda o arquivo original e a versão normalizada que a skill lê. */
export async function salvarPesquisa(slug: string, buf: Uint8Array, nomeOriginal: string): Promise<number> {
  const rel = campanhaRel(slug);
  if (!(await resumo(slug))) throw new Error("Campanha não encontrada");
  const palavras = normalizarPlanejador(buf);
  if (palavras.length === 0) throw new Error("não encontrei palavras-chave nesse arquivo");
  const dir = resolveSafe(`${rel}/pesquisa`);
  await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
  const ext = (nomeOriginal.split(".").pop() ?? "csv").toLowerCase().replace(/[^a-z0-9]/g, "") || "csv";
  await fs.writeFile(/*turbopackIgnore: true*/ path.join(dir, `original.${ext}`), buf);
  await fs.writeFile(
    /*turbopackIgnore: true*/ path.join(dir, "palavras-chave.csv"),
    toCsv([
      PESQUISA_COLUNAS,
      ...palavras.map((p) => [p.palavra, p.volume, p.volumeMin, p.volumeMax, p.concorrencia, p.lanceMin, p.lanceMax]),
    ]),
    "utf8",
  );
  return palavras.length;
}

// ---------- Leitura da campanha montada ----------

/** Lê um CSV de ads-editor/ como lista de objetos pelo cabeçalho. */
async function lerTabela(full: string): Promise<Record<string, string>[]> {
  const text = await readIfExists(full);
  if (!text) return [];
  const rows = parseCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

export async function lerCampanha(slug: string): Promise<CampanhaCompleta | null> {
  let base: CampanhaResumo | null;
  try {
    base = await resumo(slug);
  } catch {
    return null;
  }
  if (!base) return null;
  const rel = base.path;
  const { body } = splitFrontmatter((await readIfExists(resolveSafe(`${rel}/campanha.md`))) ?? "");

  const pesquisa = (await lerTabela(resolveSafe(`${rel}/pesquisa/palavras-chave.csv`))).map((r) => ({
    palavra: r.palavra,
    volume: r.volume,
    volumeMin: num(r.volume_min),
    volumeMax: num(r.volume_max),
    concorrencia: r.concorrencia,
    lanceMin: num(r.lance_min),
    lanceMax: num(r.lance_max),
  }));

  const ed = (f: string) => resolveSafe(`${rel}/ads-editor/${f}`);
  const nomesGrupos = (await lerTabela(ed("grupos.csv"))).map((g) => g["Ad Group"]).filter(Boolean);
  const keywords = await lerTabela(ed("keywords.csv"));
  const negativas = await lerTabela(ed("keywords-negativas.csv"));
  const anuncios = await lerTabela(ed("anuncios.csv"));
  // Grupos que só aparecem nas keywords também contam (caso grupos.csv falte)
  for (const k of keywords) if (k["Ad Group"] && !nomesGrupos.includes(k["Ad Group"])) nomesGrupos.push(k["Ad Group"]);

  const grupos: GrupoAnuncios[] = nomesGrupos.map((nome) => ({
    nome,
    palavras: keywords.filter((k) => k["Ad Group"] === nome).map((k) => ({ texto: k.Keyword, tipo: k["Criterion Type"] })),
    negativas: negativas.filter((n) => n["Ad Group"] === nome).map((n) => n.Keyword),
    anuncios: anuncios
      .filter((a) => a["Ad Group"] === nome)
      .map((a) => ({
        headlines: Array.from({ length: 15 }, (_, i) => a[`Headline ${i + 1}`]).filter(Boolean),
        descriptions: Array.from({ length: 4 }, (_, i) => a[`Description ${i + 1}`]).filter(Boolean),
        finalUrl: a["Final URL"] ?? "",
        path1: a["Path 1"] ?? "",
        path2: a["Path 2"] ?? "",
      })),
  }));

  let arquivos: string[] = [];
  try {
    arquivos = (await fs.readdir(/*turbopackIgnore: true*/ resolveSafe(`${rel}/ads-editor`)))
      .filter((n) => /\.(csv|md)$/i.test(n))
      .sort()
      .map((n) => `${rel}/ads-editor/${n}`);
  } catch {
    // campanha ainda não montada
  }

  return {
    ...base,
    corpo: body.trim(),
    pesquisa,
    sementes: await readIfExists(resolveSafe(`${rel}/pesquisa/sementes.md`)),
    grupos,
    negativasGlobais: negativas.filter((n) => !n["Ad Group"]).map((n) => n.Keyword),
    arquivos,
  };
}

export type AtualizacaoCampanha = { status?: StatusCampanha; lpUrl?: string; orcamentoDiario?: number | null };

export async function atualizarCampanha(slug: string, m: AtualizacaoCampanha): Promise<void> {
  const file = resolveSafe(`${campanhaRel(slug)}/campanha.md`);
  const text = await readIfExists(file);
  if (text === null) throw new Error("Campanha não encontrada");
  if (m.status !== undefined && !STATUS_CAMPANHA.includes(m.status)) throw new Error("status inválido");
  if (m.lpUrl && !/^https:\/\/\S+$/.test(m.lpUrl)) throw new Error("URL da LP precisa começar com https://");
  const { data, body } = splitFrontmatter(text);
  if (m.status !== undefined) data.status = m.status;
  if (m.lpUrl !== undefined) data.lp_url = m.lpUrl || null;
  if (m.orcamentoDiario !== undefined) data.orcamento_diario = m.orcamentoDiario;
  await fs.writeFile(/*turbopackIgnore: true*/ file, joinFrontmatter(data, body), "utf8");
}
