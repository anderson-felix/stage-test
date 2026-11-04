import { LPStatus, Prisma } from "@prisma/client";
import prisma from "./prisma";
import { SERVICOS, type Servico } from "./ads";
import { slugify } from "./frontmatter";
import { downloadTenantAssetBuffer } from "./storage";
import { resolverTenantId } from "./tenant-context";

/** Prefixo lógico das Landing Pages. */
export const LP_DIR = "marketing/landing-pages";

export const STATUS_LP = ["rascunho", "aprovada", "publicada"] as const;
export type StatusLP = (typeof STATUS_LP)[number];

/** Para que serve a LP: levar o clique de uma Campanha de Ads, ou ser uma página/matéria do site (orgânico). */
export const FINALIDADES_LP = ["campanha", "site"] as const;
export type FinalidadeLP = (typeof FINALIDADES_LP)[number];

export type LandingPage = {
  id?: string;
  tenantId?: string;
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
  /** Timestamp da última geração/edição do HTML (0 se ainda não foi gerado), para furar o cache do preview. */
  versao: number;
  draftHtml?: string | null;
  publishedBlobUrl?: string | null;
  viewsCount?: number;
  leadsCount?: number;
  language?: string;
  toneStyle?: string;
  trackingConfig?: Record<string, unknown> | null;
  seoMetadata?: Record<string, unknown> | null;
  customDomainId?: string | null;
};

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

const str = (v: unknown) =>
  typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);

type BriefingDataJson = {
  briefing?: string;
  legacyStatus?: string;
  urlPublicada?: string;
  criadaEm?: string | null;
  campanhaSlug?: string | null;
  versao?: number;
  referenceAssetId?: string | null;
};

function mapPrismaLpToLandingPage(
  row: {
    id: string;
    tenantId: string;
    customDomainId: string | null;
    slug: string;
    title: string;
    purpose: string;
    serviceType: string | null;
    language: string;
    toneStyle: string;
    briefingData: Prisma.JsonValue;
    draftHtml: string | null;
    publishedBlobUrl: string | null;
    seoMetadata: Prisma.JsonValue;
    trackingConfig: Prisma.JsonValue;
    viewsCount: number;
    status: LPStatus;
    createdAt: Date;
    updatedAt: Date;
    _count?: { leads: number };
    adCampaigns?: { slug: string }[];
  }
): LandingPage {
  const bd =
    row.briefingData && typeof row.briefingData === "object" && !Array.isArray(row.briefingData)
      ? (row.briefingData as BriefingDataJson)
      : {};

  const finalidade: FinalidadeLP = row.purpose === "site" ? "site" : "campanha";
  const linkedCampanha =
    row.adCampaigns?.[0]?.slug ??
    (typeof bd.campanhaSlug === "string" && SLUG.test(bd.campanhaSlug) ? bd.campanhaSlug : null);

  let status: StatusLP = "rascunho";
  if (row.status === LPStatus.PUBLISHED || bd.legacyStatus === "publicada") {
    status = "publicada";
  } else if (bd.legacyStatus === "aprovada") {
    status = "aprovada";
  }

  const versao =
    row.draftHtml && row.draftHtml.trim().length > 0
      ? bd.versao && bd.versao > 0
        ? bd.versao
        : row.updatedAt.getTime()
      : 0;

  return {
    id: row.id,
    tenantId: row.tenantId,
    customDomainId: row.customDomainId,
    slug: row.slug,
    path: `${LP_DIR}/${row.slug}`,
    titulo: row.title || row.slug,
    servico: SERVICOS.find((s) => s === row.serviceType) ?? "institucional",
    finalidade,
    campanha: finalidade === "campanha" ? linkedCampanha : null,
    status,
    urlPublicada: str(bd.urlPublicada),
    criadaEm: bd.criadaEm ?? row.createdAt.toISOString().slice(0, 10),
    briefing: str(bd.briefing),
    versao,
    draftHtml: row.draftHtml,
    publishedBlobUrl: row.publishedBlobUrl,
    viewsCount: row.viewsCount,
    leadsCount: row._count?.leads ?? 0,
    language: row.language,
    toneStyle: row.toneStyle,
    trackingConfig:
      row.trackingConfig && typeof row.trackingConfig === "object" && !Array.isArray(row.trackingConfig)
        ? (row.trackingConfig as Record<string, unknown>)
        : null,
    seoMetadata:
      row.seoMetadata && typeof row.seoMetadata === "object" && !Array.isArray(row.seoMetadata)
        ? (row.seoMetadata as Record<string, unknown>)
        : null,
  };
}

export async function lerLP(slug: string, tenantId?: string): Promise<LandingPage | null> {
  if (!SLUG.test(slug)) return null;
  const tid = await resolverTenantId(tenantId);

  const row = await prisma.landingPage.findUnique({
    where: {
      tenantId_slug: {
        tenantId: tid,
        slug,
      },
    },
    include: {
      _count: { select: { leads: true } },
      adCampaigns: { select: { slug: true }, take: 1 },
    },
  });

  if (!row) return null;
  return mapPrismaLpToLandingPage(row);
}

export async function listarLPs(tenantId?: string): Promise<LandingPage[]> {
  const tid = await resolverTenantId(tenantId);
  const rows = await prisma.landingPage.findMany({
    where: { tenantId: tid },
    include: {
      _count: { select: { leads: true } },
      adCampaigns: { select: { slug: true }, take: 1 },
    },
    orderBy: { slug: "desc" },
  });

  return rows.map(mapPrismaLpToLandingPage);
}

export type NovaLP = {
  titulo: string;
  servico: Servico;
  finalidade: FinalidadeLP;
  campanha: string | null;
  briefing: string;
  language?: string;
  toneStyle?: string;
  referenceAssetId?: string | null;
};

async function conferirCampanhaNoTenant(slug: string, tenantId: string) {
  if (!SLUG.test(slug)) throw new Error("Campanha não encontrada");
  const camp = await prisma.adCampaign.findUnique({
    where: {
      tenantId_slug: {
        tenantId,
        slug,
      },
    },
  });
  if (!camp) throw new Error("Campanha não encontrada");
  return camp;
}

/** Cria o registro da LP no PostgreSQL e devolve o slug. */
export async function criarLP(n: NovaLP, tenantId?: string): Promise<string> {
  if (!FINALIDADES_LP.includes(n.finalidade)) throw new Error("finalidade inválida");
  const tid = await resolverTenantId(tenantId);

  const campanhaSlug = n.finalidade === "campanha" && n.campanha ? n.campanha : null;
  const camp = campanhaSlug ? await conferirCampanhaNoTenant(campanhaSlug, tid) : null;

  const base = slugify(n.titulo);
  let slug = base;
  for (let i = 2; ; i++) {
    const exists = await prisma.landingPage.findUnique({
      where: { tenantId_slug: { tenantId: tid, slug } },
      select: { id: true },
    });
    if (!exists) break;
    slug = `${base}-${i}`;
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const briefingClean =
    n.briefing.trim() || "(sem briefing: usar a memória, a estratégia e o serviço escolhido)";

  const briefingData: BriefingDataJson = {
    briefing: briefingClean,
    legacyStatus: "rascunho",
    urlPublicada: "",
    criadaEm: hoje,
    campanhaSlug,
    versao: 0,
    referenceAssetId: n.referenceAssetId ?? null,
  };

  const created = await prisma.landingPage.create({
    data: {
      tenantId: tid,
      slug,
      title: n.titulo.trim(),
      purpose: n.finalidade,
      serviceType: n.servico,
      language: n.language || "pt-BR",
      toneStyle: n.toneStyle || "Consultivo",
      status: LPStatus.DRAFT,
      briefingData: briefingData as Prisma.InputJsonValue,
      trackingConfig: { gtmId: null, hotjarId: null, metaPixelId: null },
      seoMetadata: { title: n.titulo.trim(), description: "" },
    },
  });

  if (camp) {
    await prisma.adCampaign.update({
      where: { id: camp.id },
      data: { landingPageId: created.id },
    });
  }

  return slug;
}

export type MudancaLP = {
  status?: StatusLP;
  urlPublicada?: string;
  finalidade?: FinalidadeLP;
  campanha?: string | null;
  draftHtml?: string;
  trackingConfig?: Record<string, unknown>;
  seoMetadata?: Record<string, unknown>;
  customDomainId?: string | null;
};

export async function atualizarLP(slug: string, m: MudancaLP, tenantId?: string): Promise<void> {
  if (!SLUG.test(slug)) throw new Error("LP não encontrada");
  const tid = await resolverTenantId(tenantId);

  const row = await prisma.landingPage.findUnique({
    where: { tenantId_slug: { tenantId: tid, slug } },
    include: { adCampaigns: true },
  });
  if (!row) throw new Error("LP não encontrada");

  if (m.status !== undefined && !STATUS_LP.includes(m.status)) throw new Error("status inválido");
  if (m.urlPublicada && !/^https:\/\/\S+$/.test(m.urlPublicada)) {
    throw new Error("URL precisa começar com https://");
  }
  if (m.finalidade !== undefined && !FINALIDADES_LP.includes(m.finalidade)) {
    throw new Error("finalidade inválida");
  }

  let targetCamp = null;
  if (m.campanha) {
    targetCamp = await conferirCampanhaNoTenant(m.campanha, tid);
  }

  const bd: BriefingDataJson =
    row.briefingData && typeof row.briefingData === "object" && !Array.isArray(row.briefingData)
      ? { ...(row.briefingData as BriefingDataJson) }
      : {};

  let finalidade: FinalidadeLP =
    m.finalidade !== undefined ? m.finalidade : row.purpose === "site" ? "site" : "campanha";

  if (m.campanha) finalidade = "campanha";

  const campanhaSlug =
    finalidade === "site"
      ? null
      : m.campanha !== undefined
        ? m.campanha
        : (bd.campanhaSlug ?? null);

  if (m.status !== undefined) bd.legacyStatus = m.status;
  if (m.urlPublicada !== undefined) bd.urlPublicada = m.urlPublicada || "";
  bd.campanhaSlug = campanhaSlug;

  let draftHtml = row.draftHtml;
  if (m.draftHtml !== undefined) {
    draftHtml = m.draftHtml;
    bd.versao = Date.now();
  }

  const newStatusEnum =
    bd.legacyStatus === "publicada" ? LPStatus.PUBLISHED : LPStatus.DRAFT;

  await prisma.$transaction(async (tx) => {
    await tx.landingPage.update({
      where: { id: row.id },
      data: {
        purpose: finalidade,
        status: newStatusEnum,
        publishedAt:
          newStatusEnum === LPStatus.PUBLISHED
            ? row.publishedAt ?? new Date()
            : row.publishedAt,
        draftHtml,
        briefingData: bd as Prisma.InputJsonValue,
        ...(m.trackingConfig !== undefined
          ? { trackingConfig: m.trackingConfig as Prisma.InputJsonValue }
          : {}),
        ...(m.seoMetadata !== undefined
          ? { seoMetadata: m.seoMetadata as Prisma.InputJsonValue }
          : {}),
        ...(m.customDomainId !== undefined ? { customDomainId: m.customDomainId } : {}),
      },
    });

    if (m.campanha !== undefined || finalidade === "site") {
      await tx.adCampaign.updateMany({
        where: { tenantId: tid, landingPageId: row.id },
        data: { landingPageId: null },
      });
      if (targetCamp && finalidade === "campanha") {
        await tx.adCampaign.update({
          where: { id: targetCamp.id },
          data: { landingPageId: row.id },
        });
      }
    }
  });
}

/** Salva o HTML gerado ou editado diretamente no PostgreSQL. */
export async function salvarHtmlLP(slug: string, html: string, tenantId?: string): Promise<void> {
  await atualizarLP(slug, { draftHtml: html }, tenantId);
}

/** index.html com o logo do tenant embutido (data URI): um arquivo só, pronto para publicar no Blob Storage. */
export async function htmlAutocontido(slug: string, tenantId?: string): Promise<string> {
  if (!SLUG.test(slug)) throw new Error("LP não encontrada");
  const tid = await resolverTenantId(tenantId);

  const row = await prisma.landingPage.findUnique({
    where: { tenantId_slug: { tenantId: tid, slug } },
    include: {
      tenant: {
        include: { brandProfile: true },
      },
    },
  });

  if (!row) throw new Error("LP não encontrada");
  const html = row.draftHtml;
  if (!html) throw new Error("a LP ainda não foi gerada");

  let logoBuf: Buffer | null = null;
  const brandLogoBlob = row.tenant.brandProfile?.logoBlobUrl;
  if (brandLogoBlob) {
    const dl = await downloadTenantAssetBuffer(brandLogoBlob).catch(() => null);
    logoBuf = dl?.buffer ?? null;
  }
  if (!logoBuf) {
    const logoAsset = await prisma.mediaAsset.findFirst({
      where: { tenantId: tid, category: "logo" },
      orderBy: { createdAt: "desc" },
    });
    if (logoAsset) {
      const dl = await downloadTenantAssetBuffer(logoAsset.blobUrl).catch(() => null);
      logoBuf = dl?.buffer ?? null;
    }
  }

  if (!logoBuf) return html;
  const dataUri = `data:image/png;base64,${logoBuf.toString("base64")}`;
  return html.replace(/(["'(])(\.\/)?logo\.png(["')])/g, `$1${dataUri}$3`);
}
