import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { decodeTexto, detectarSeparador, parseCsv, toCsv } from "./csv";
import { joinFrontmatter, slugify } from "./frontmatter";
import { resolverTenantId } from "./tenant-context";
import { resolveSafe } from "./workspace";

/** Pasta das Campanhas dentro do workspace (ver docs/BACKEND.md). */
export const CAMPANHAS_DIR = "marketing/ads/campanhas";

export const SERVICOS = [
  "technology",
  "strategy-business",
  "experience-design",
  "people-development",
  "institucional",
] as const;
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
  id?: string;
  tenantId?: string;
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
  language?: string;
};

export type Anuncio = {
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  path1: string;
  path2: string;
};
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

const str = (v: unknown) =>
  typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
const num = (v: unknown) =>
  typeof v === "number"
    ? v
    : typeof v === "string" && v.trim() && !isNaN(Number(v))
      ? Number(v)
      : null;

type AdsEditorDataJson = {
  objetivo?: string;
  regiao?: string;
  lpUrl?: string;
  criadaEm?: string | null;
  toneStyle?: string;
  referenceAssetId?: string | null;
  csvFiles?: Record<string, string>;
  gruposCsv?: Record<string, string>[];
  keywordsCsv?: Record<string, string>[];
  negativasCsv?: Record<string, string>[];
  anunciosCsv?: Record<string, string>[];
  campanhasCsv?: Record<string, string>[];
  sitelinksCsv?: Record<string, string>[];
};

type SeedKeywordsJson = {
  rawMarkdown?: string;
  terms?: string[];
};

export function parseCsvTableText(text: string | null | undefined): Record<string, string>[] {
  if (!text) return [];
  const rows = parseCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function mapRowToResumo(row: {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  budget: Prisma.Decimal | null;
  serviceType: string | null;
  language: string;
  status: string;
  seedKeywords: Prisma.JsonValue;
  keywordResearchCsv: string | null;
  adsEditorData: Prisma.JsonValue;
  createdAt: Date;
}): CampanhaResumo {
  const ed =
    row.adsEditorData && typeof row.adsEditorData === "object" && !Array.isArray(row.adsEditorData)
      ? (row.adsEditorData as AdsEditorDataJson)
      : {};

  const sk =
    row.seedKeywords && typeof row.seedKeywords === "object" && !Array.isArray(row.seedKeywords)
      ? (row.seedKeywords as SeedKeywordsJson)
      : null;

  const hasKeywordsCsv =
    Boolean(ed.csvFiles && ed.csvFiles["keywords.csv"]) ||
    Boolean(Array.isArray(ed.keywordsCsv) && ed.keywordsCsv.length > 0);

  return {
    id: row.id,
    tenantId: row.tenantId,
    slug: row.slug,
    path: `${CAMPANHAS_DIR}/${row.slug}`,
    titulo: row.name || row.slug,
    servico: SERVICOS.find((s) => s === row.serviceType) ?? "institucional",
    status: STATUS_CAMPANHA.find((s) => s === row.status) ?? "rascunho",
    orcamentoDiario: row.budget !== null ? Number(row.budget) : null,
    regiao: str(ed.regiao) || "Brazil",
    lpUrl: str(ed.lpUrl),
    criadaEm: ed.criadaEm ?? row.createdAt.toISOString().slice(0, 10),
    temPesquisa: Boolean(row.keywordResearchCsv && row.keywordResearchCsv.trim().length > 0),
    temSementes: Boolean(sk?.rawMarkdown && sk.rawMarkdown.trim().length > 0),
    montada: hasKeywordsCsv,
    language: row.language,
  };
}

export async function listarCampanhas(tenantId?: string): Promise<CampanhaResumo[]> {
  const tid = await resolverTenantId(tenantId);
  const rows = await prisma.adCampaign.findMany({
    where: { tenantId: tid },
    orderBy: { slug: "desc" },
  });
  return rows.map(mapRowToResumo);
}

export type NovaCampanha = {
  titulo: string;
  servico: Servico;
  objetivo: string;
  orcamentoDiario: number | null;
  regiao: string;
  briefing: string;
  language?: string;
  toneStyle?: string;
  referenceAssetId?: string | null;
};

/** Cria a Campanha no PostgreSQL (e pasta local em dev); devolve o slug. */
export async function criarCampanha(c: NovaCampanha, tenantId?: string): Promise<string> {
  const tid = await resolverTenantId(tenantId);
  const hoje = new Date().toISOString().slice(0, 10);
  const base = `${hoje}-${slugify(c.titulo)}`;
  let slug = base;
  for (let i = 2; ; i++) {
    const exists = await prisma.adCampaign.findUnique({
      where: { tenantId_slug: { tenantId: tid, slug } },
      select: { id: true },
    });
    if (!exists) break;
    slug = `${base}-${i}`;
  }

  const briefingClean =
    c.briefing.trim() || "(sem briefing: usar a estratégia e o serviço escolhido)";
  const corpo = `## Briefing\n\n${briefingClean}`;

  const adsEditorData: AdsEditorDataJson = {
    objetivo: c.objetivo || "formulario",
    regiao: c.regiao || "Brazil",
    lpUrl: "",
    criadaEm: hoje,
    toneStyle: c.toneStyle || "Consultivo",
    referenceAssetId: c.referenceAssetId ?? null,
    csvFiles: {},
  };

  await prisma.adCampaign.create({
    data: {
      tenantId: tid,
      slug,
      name: c.titulo.trim(),
      serviceType: c.servico,
      language: c.language || "pt-BR",
      status: "rascunho",
      budget: c.orcamentoDiario !== null ? c.orcamentoDiario : null,
      strategyMarkdown: corpo,
      adsEditorData: adsEditorData as Prisma.InputJsonValue,
    },
  });

  if (process.env.NODE_ENV !== "production") {
    try {
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
      await fs.writeFile(
        /*turbopackIgnore: true*/ resolveSafe(`${rel}/campanha.md`),
        joinFrontmatter(data, `${corpo}\n`),
        "utf8"
      );
    } catch {
      // ignora erro de disco local
    }
  }

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
  const mult =
    m[2] === "mil" || m[2] === "k" ? 1e3 : m[2] === "mi" || m[2] === "m" ? 1e6 : 1;
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
  const ehCabecalho = (cells: string[]) =>
    cells.some((c) => /^(keyword|palavra[- ]chave|palavras[- ]chave)$/i.test(c.trim()));
  const idxLinha = linhas
    .slice(0, 20)
    .findIndex((l) => ehCabecalho(l.split(detectarSeparador(l))));

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
      .map((palavra) => ({
        palavra,
        volume: "",
        volumeMin: null,
        volumeMax: null,
        concorrencia: "",
        lanceMin: null,
        lanceMax: null,
      }))
      .filter(unico);
  }

  const sep = detectarSeparador(linhas[idxLinha]);
  const rows = parseCsv(linhas.slice(idxLinha).join("\n"), sep);
  const head = rows[0].map((h) => h.trim());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iPalavra = col(/^(keyword|palavra[- ]chave|palavras[- ]chave)$/i);
  const iVolume = col(
    /avg\.? monthly searches|m[eé]dia de pesquisas mensais|pesquisas mensais/i
  );
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

const PESQUISA_COLUNAS = [
  "palavra",
  "volume",
  "volume_min",
  "volume_max",
  "concorrencia",
  "lance_min",
  "lance_max",
];

/** Guarda a pesquisa normalizada no PostgreSQL (e em disco em dev). */
export async function salvarPesquisa(
  slug: string,
  buf: Uint8Array,
  nomeOriginal: string,
  tenantId?: string
): Promise<number> {
  if (!SLUG.test(slug)) throw new Error("Campanha não encontrada");
  const tid = await resolverTenantId(tenantId);

  const row = await prisma.adCampaign.findUnique({
    where: { tenantId_slug: { tenantId: tid, slug } },
  });
  if (!row) throw new Error("Campanha não encontrada");

  const palavras = normalizarPlanejador(buf);
  if (palavras.length === 0) throw new Error("não encontrei palavras-chave nesse arquivo");

  const csvNormalized = toCsv([
    PESQUISA_COLUNAS,
    ...palavras.map((p) => [
      p.palavra,
      p.volume,
      p.volumeMin,
      p.volumeMax,
      p.concorrencia,
      p.lanceMin,
      p.lanceMax,
    ]),
  ]);

  await prisma.adCampaign.update({
    where: { id: row.id },
    data: {
      keywordResearchCsv: csvNormalized,
    },
  });

  if (process.env.NODE_ENV !== "production") {
    try {
      const rel = campanhaRel(slug);
      const dir = resolveSafe(`${rel}/pesquisa`);
      await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
      const ext =
        (nomeOriginal.split(".").pop() ?? "csv").toLowerCase().replace(/[^a-z0-9]/g, "") ||
        "csv";
      await fs.writeFile(/*turbopackIgnore: true*/ path.join(dir, `original.${ext}`), buf);
      await fs.writeFile(
        /*turbopackIgnore: true*/ path.join(dir, "palavras-chave.csv"),
        csvNormalized,
        "utf8"
      );
    } catch {
      // ignora erro local
    }
  }

  return palavras.length;
}

// ---------- Leitura da campanha montada ----------

export async function lerCampanha(
  slug: string,
  tenantId?: string
): Promise<CampanhaCompleta | null> {
  if (!SLUG.test(slug)) return null;
  const tid = await resolverTenantId(tenantId);

  const row = await prisma.adCampaign.findUnique({
    where: { tenantId_slug: { tenantId: tid, slug } },
  });
  if (!row) return null;

  const base = mapRowToResumo(row);
  const rel = base.path;

  const ed =
    row.adsEditorData && typeof row.adsEditorData === "object" && !Array.isArray(row.adsEditorData)
      ? (row.adsEditorData as AdsEditorDataJson)
      : {};

  const sk =
    row.seedKeywords && typeof row.seedKeywords === "object" && !Array.isArray(row.seedKeywords)
      ? (row.seedKeywords as SeedKeywordsJson)
      : null;

  const pesquisa = parseCsvTableText(row.keywordResearchCsv).map((r) => ({
    palavra: r.palavra,
    volume: r.volume,
    volumeMin: num(r.volume_min),
    volumeMax: num(r.volume_max),
    concorrencia: r.concorrencia,
    lanceMin: num(r.lance_min),
    lanceMax: num(r.lance_max),
  }));

  const csvFiles = ed.csvFiles ?? {};
  const gruposTable = ed.gruposCsv ?? parseCsvTableText(csvFiles["grupos.csv"]);
  const keywords = ed.keywordsCsv ?? parseCsvTableText(csvFiles["keywords.csv"]);
  const negativas =
    ed.negativasCsv ?? parseCsvTableText(csvFiles["keywords-negativas.csv"]);
  const anuncios = ed.anunciosCsv ?? parseCsvTableText(csvFiles["anuncios.csv"]);

  const nomesGrupos = gruposTable.map((g) => g["Ad Group"]).filter(Boolean);
  for (const k of keywords) {
    if (k["Ad Group"] && !nomesGrupos.includes(k["Ad Group"])) {
      nomesGrupos.push(k["Ad Group"]);
    }
  }

  const grupos: GrupoAnuncios[] = nomesGrupos.map((nome) => ({
    nome,
    palavras: keywords
      .filter((k) => k["Ad Group"] === nome)
      .map((k) => ({ texto: k.Keyword, tipo: k["Criterion Type"] })),
    negativas: negativas.filter((n) => n["Ad Group"] === nome).map((n) => n.Keyword),
    anuncios: anuncios
      .filter((a) => a["Ad Group"] === nome)
      .map((a) => ({
        headlines: Array.from({ length: 15 }, (_, i) => a[`Headline ${i + 1}`]).filter(
          Boolean
        ),
        descriptions: Array.from(
          { length: 4 },
          (_, i) => a[`Description ${i + 1}`]
        ).filter(Boolean),
        finalUrl: a["Final URL"] ?? "",
        path1: a["Path 1"] ?? "",
        path2: a["Path 2"] ?? "",
      })),
  }));

  const arquivos = Object.keys(csvFiles)
    .filter((n) => /\.(csv|md)$/i.test(n))
    .sort()
    .map((n) => `${rel}/ads-editor/${n}`);

  return {
    ...base,
    corpo: (row.strategyMarkdown ?? "").trim(),
    pesquisa,
    sementes: sk?.rawMarkdown ?? null,
    grupos,
    negativasGlobais: negativas.filter((n) => !n["Ad Group"]).map((n) => n.Keyword),
    arquivos,
  };
}

export type AtualizacaoCampanha = {
  status?: StatusCampanha;
  lpUrl?: string;
  orcamentoDiario?: number | null;
  strategyMarkdown?: string;
  seedKeywordsMarkdown?: string;
  csvFiles?: Record<string, string>;
};

export async function atualizarCampanha(
  slug: string,
  m: AtualizacaoCampanha,
  tenantId?: string
): Promise<void> {
  if (!SLUG.test(slug)) throw new Error("Campanha não encontrada");
  const tid = await resolverTenantId(tenantId);

  const row = await prisma.adCampaign.findUnique({
    where: { tenantId_slug: { tenantId: tid, slug } },
  });
  if (!row) throw new Error("Campanha não encontrada");

  if (m.status !== undefined && !STATUS_CAMPANHA.includes(m.status)) {
    throw new Error("status inválido");
  }
  if (m.lpUrl && !/^https:\/\/\S+$/.test(m.lpUrl)) {
    throw new Error("URL da LP precisa começar com https://");
  }

  const ed: AdsEditorDataJson =
    row.adsEditorData && typeof row.adsEditorData === "object" && !Array.isArray(row.adsEditorData)
      ? { ...(row.adsEditorData as AdsEditorDataJson) }
      : {};

  if (m.lpUrl !== undefined) ed.lpUrl = m.lpUrl || "";

  if (m.csvFiles !== undefined) {
    const mergedCsv = { ...(ed.csvFiles ?? {}), ...m.csvFiles };
    ed.csvFiles = mergedCsv;
    ed.gruposCsv = parseCsvTableText(mergedCsv["grupos.csv"]);
    ed.keywordsCsv = parseCsvTableText(mergedCsv["keywords.csv"]);
    ed.negativasCsv = parseCsvTableText(mergedCsv["keywords-negativas.csv"]);
    ed.anunciosCsv = parseCsvTableText(mergedCsv["anuncios.csv"]);
    ed.campanhasCsv = parseCsvTableText(mergedCsv["campanhas.csv"]);
    ed.sitelinksCsv = parseCsvTableText(mergedCsv["extensoes-sitelinks.csv"]);
  }

  let seedKeywords = row.seedKeywords;
  if (m.seedKeywordsMarkdown !== undefined) {
    seedKeywords = {
      rawMarkdown: m.seedKeywordsMarkdown,
      terms: m.seedKeywordsMarkdown
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#")),
    };
  }

  await prisma.adCampaign.update({
    where: { id: row.id },
    data: {
      ...(m.status !== undefined ? { status: m.status } : {}),
      ...(m.orcamentoDiario !== undefined ? { budget: m.orcamentoDiario } : {}),
      ...(m.strategyMarkdown !== undefined ? { strategyMarkdown: m.strategyMarkdown } : {}),
      ...(m.seedKeywordsMarkdown !== undefined
        ? { seedKeywords: seedKeywords as Prisma.InputJsonValue }
        : {}),
      adsEditorData: ed as Prisma.InputJsonValue,
    },
  });
}

/** Lê um arquivo CSV ou MD da Campanha diretamente do banco (com fallback para disco em dev). */
export async function lerArquivoCampanha(
  relPath: string,
  tenantId?: string
): Promise<{ content: string; filename: string; contentType: string } | null> {
  const segmentos = relPath.split(/[\\/]/);
  const ok =
    relPath.startsWith(`${CAMPANHAS_DIR}/`) &&
    !segmentos.includes("..") &&
    segmentos.length >= 5 &&
    (segmentos.includes("ads-editor") || segmentos.includes("pesquisa")) &&
    /\.(csv|md)$/i.test(relPath);
  if (!ok) return null;

  const cSlug = segmentos[3];
  const folder = segmentos[4];
  const fileName = segmentos[segmentos.length - 1];
  const tid = await resolverTenantId(tenantId);

  const row = await prisma.adCampaign.findUnique({
    where: { tenantId_slug: { tenantId: tid, slug: cSlug } },
  });
  if (!row) return null;

  const contentType = relPath.endsWith(".md")
    ? "text/markdown; charset=utf-8"
    : "text/csv; charset=utf-8";
  const downloadFilename = `${cSlug}-${fileName}`;

  if (folder === "pesquisa") {
    if (fileName === "palavras-chave.csv" && row.keywordResearchCsv) {
      return { content: row.keywordResearchCsv, filename: downloadFilename, contentType };
    }
    if (fileName === "sementes.md" && row.seedKeywords && typeof row.seedKeywords === "object") {
      const sk = row.seedKeywords as SeedKeywordsJson;
      if (sk.rawMarkdown) {
        return { content: sk.rawMarkdown, filename: downloadFilename, contentType };
      }
    }
  } else if (folder === "ads-editor") {
    const ed =
      row.adsEditorData && typeof row.adsEditorData === "object"
        ? (row.adsEditorData as AdsEditorDataJson)
        : {};
    const csvContent = ed.csvFiles?.[fileName];
    if (typeof csvContent === "string") {
      return { content: csvContent, filename: downloadFilename, contentType };
    }
  }

  if (process.env.NODE_ENV !== "production") {
    try {
      const text = await fs.readFile(/*turbopackIgnore: true*/ resolveSafe(relPath), "utf8");
      return { content: text, filename: downloadFilename, contentType };
    } catch {
      return null;
    }
  }

  return null;
}
