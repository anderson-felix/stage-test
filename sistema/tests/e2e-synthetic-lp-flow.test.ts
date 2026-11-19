import { matches, apply } from "./helpers/durable-db";
import assert from "node:assert/strict";
import Module from "node:module";
import { beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { DnsStatus, LPStatus, SslStatus } from "@prisma/client";

type DomainRow = {
  id: string;
  tenantId: string;
  domain: string;
  dnsStatus: DnsStatus;
  sslStatus: SslStatus;
  homeLandingPageId: string | null;
};

type LpRow = {
  id: string;
  tenantId: string;
  customDomainId: string | null;
  slug: string;
  title: string;
  draftHtml: string;
  publishedBlobUrl: string | null;
  publishedAssetIds: string[];
  status: LPStatus;
  publishedAt: Date | null;
  briefingData: Record<string, unknown>;
  trackingConfig: Record<string, unknown> | null;
  seoMetadata: Record<string, unknown> | null;
  viewsCount: number;
};

type LeadRow = { emailAttemptCount?: number;
  id: string;
  tenantId: string;
  landingPageId: string;
  payload: Record<string, unknown>;
  utmData: Record<string, unknown>;
  emailDeliveryStatus: string;
  createdAt: Date;
};

let domainRow: DomainRow;
let lpRow: LpRow;
let leads: LeadRow[];
let blobs: Map<string, { buffer: Buffer; mimeType: string }>;
let blobSeq = 0;

function resetFixtures(): void {
  blobSeq = 0;
  blobs = new Map([
    [
      "https://storage.blob.core.windows.net/assets/t-test/lp_asset/2026-11/hero.png",
      { buffer: Buffer.from("PNG_DATA"), mimeType: "image/png" },
    ],
  ]);
  domainRow = {
    id: "dom-garapa",
    tenantId: "t-test",
    domain: "lp.garapalabs.com",
    dnsStatus: DnsStatus.VERIFIED,
    sslStatus: SslStatus.ACTIVE,
    homeLandingPageId: null,
  };
  lpRow = {
    id: "lp-synth-1",
    tenantId: "t-test",
    customDomainId: "dom-garapa",
    slug: "lp-sintetica-teste",
    title: "LP Sintética Teste",
    draftHtml:
      '<html><head><title>Versao 1</title></head><body><h1>Oferta V1</h1><img src="/api/media/asset-hero-1" /><form><input name="email"/></form></body></html>',
    publishedBlobUrl: null,
    publishedAssetIds: [],
    status: LPStatus.DRAFT,
    publishedAt: null,
    briefingData: { legacyStatus: "rascunho" },
    trackingConfig: null,
    seoMetadata: null,
    viewsCount: 0,
  };
  leads = [];
}

const mockPrisma: {
  landingPage: {
    findUnique: () => Promise<Record<string, unknown> | null>;
    findFirst: (args: {
      where?: {
        id?: string;
        slug?: string;
        tenantId?: string;
        customDomainId?: string | null;
        status?: LPStatus;
        publishedAssetIds?: { has: string };
      };
    }) => Promise<Record<string, unknown> | null>;
    update: (args: { data: Partial<LpRow> & { viewsCount?: { increment: number } } }) => Promise<LpRow>;
  };
  customDomain: {
    findFirst: (args: { where?: { homeLandingPageId?: { not: null } }; select?: { homeLandingPage?: boolean } }) => Promise<unknown>;
    update: (args: { data: { homeLandingPageId: string | null } }) => Promise<DomainRow>;
    updateMany: (args: { where?: { homeLandingPageId?: string; id?: { not: string } }; data: { homeLandingPageId: string | null } }) => Promise<{ count: number }>;
  };
  tenant: {
    findUnique: () => Promise<{ id: string; isActive: boolean }>;
  };
  mediaAsset: {
    findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    findMany: () => Promise<Array<{ id: string }>>;
    delete: () => Promise<{ id: string }>;
  };
  lpLead: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    findMany: (args: { where: { emailDeliveryStatus: string } }) => Promise<Array<{ id: string }>>;
    updateMany: (args: { where: { id: string; emailDeliveryStatus: { in: string[] } }; data: { emailDeliveryStatus: string } }) => Promise<{ count: number }>;
    update: (args: { where: { id: string }; data: { emailDeliveryStatus: string } }) => Promise<LeadRow>;
  };
  $transaction: <T>(fn: (tx: typeof mockPrisma) => Promise<T>) => Promise<T>;
  $disconnect: () => Promise<void>;
} = {
  landingPage: {
    findUnique: async () => ({
      ...lpRow,
      tenant: { id: "t-test", slug: "stage-consulting", isActive: true },
      customDomain: domainRow,
    }),
    findFirst: async (args) => {
      const w = args?.where ?? {};
      if (w.id && lpRow.id !== w.id) return null;
      if (w.slug && lpRow.slug !== w.slug) return null;
      if (w.tenantId && lpRow.tenantId !== w.tenantId) return null;
      if (w.customDomainId !== undefined && lpRow.customDomainId !== w.customDomainId) return null;
      if (w.status && lpRow.status !== w.status) return null;
      if (w.publishedAssetIds?.has && !lpRow.publishedAssetIds.includes(w.publishedAssetIds.has)) return null;
      return { ...lpRow, tenant: { id: "t-test", isActive: true } };
    },
    update: async (args) => {
      if (args.data.viewsCount && typeof args.data.viewsCount === "object" && "increment" in args.data.viewsCount) {
        lpRow.viewsCount += 1;
        return lpRow;
      }
      lpRow = { ...lpRow, ...(args.data as Partial<LpRow>) };
      return lpRow;
    },
  },
  customDomain: {
    findFirst: async (args) => {
      if (args?.where?.homeLandingPageId && domainRow.homeLandingPageId === null) return null;
      if (args?.select?.homeLandingPage) {
        return {
          ...domainRow,
          homeLandingPage: domainRow.homeLandingPageId === lpRow.id ? { ...lpRow } : null,
        };
      }
      return domainRow;
    },
    update: async (args) => {
      domainRow.homeLandingPageId = args.data.homeLandingPageId;
      return domainRow;
    },
    updateMany: async (args) => {
      if (args.where?.id?.not === domainRow.id) return { count: 0 };
      if (!args.where?.homeLandingPageId || domainRow.homeLandingPageId === args.where.homeLandingPageId) {
        domainRow.homeLandingPageId = args.data.homeLandingPageId;
        return { count: 1 };
      }
      return { count: 0 };
    },
  },
  tenant: {
    findUnique: async () => ({ id: "t-test", isActive: true }),
  },
  mediaAsset: {
    findUnique: async (args) =>
      args.where.id === "asset-hero-1"
        ? {
            id: "asset-hero-1",
            tenantId: "t-test",
            category: "lp_asset",
            fileName: "hero.png",
            mimeType: "image/png",
            blobUrl: "https://storage.blob.core.windows.net/assets/t-test/lp_asset/2026-11/hero.png",
          }
        : null,
    findMany: async () => [{ id: "asset-hero-1" }],
    delete: async () => ({ id: "deleted" }),
  },
  lpLead: {
    create: async (args) => {
      const row: LeadRow = {
        id: `lead-${leads.length + 1}`,
        tenantId: args.data.tenantId as string,
        landingPageId: args.data.landingPageId as string,
        payload: args.data.payload as Record<string, unknown>,
        utmData: args.data.utmData as Record<string, unknown>,
        emailDeliveryStatus: args.data.emailDeliveryStatus as string,
        emailAttemptCount: 0,
        createdAt: new Date(),
      };
      leads.push(row);
      return { id: row.id };
    },
    findUnique: async (args) => {
      const row = leads.find((l) => l.id === args.where.id);
      if (!row) return null;
      return {
        ...row,
        landingPage: { id: lpRow.id, title: lpRow.title, slug: lpRow.slug },
        tenant: { id: "t-test", name: "Stage Consulting", emailConfig: null, members: [] },
      };
    },
    findMany: async (args) =>
      leads.filter((l) => matches(l, args.where)).map((l) => ({ id: l.id })),
    updateMany: async (args) => {
      let count = 0;
      for (const l of leads) {
        if (matches(l, args.where)) {
          apply(l, args.data);
          count++;
        }
      }
      return { count };
    },
    update: async (args) => {
      const l = leads.find((x) => x.id === args.where.id);
      if (!l) throw new Error("Lead not found");
      l.emailDeliveryStatus = args.data.emailDeliveryStatus;
      return l;
    },
  },
  $transaction: async (fn) => fn(mockPrisma),
  $disconnect: async () => {},
};

class MockStorageConfigError extends Error {
  statusCode = 503;
  code = "STORAGE_CONFIG_ERROR";
}
class MockStorageOperationError extends Error {
  statusCode = 503;
  code = "STORAGE_ERROR";
}

const originalLoad = (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load;

(Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "@/lib/auth") {
    return {
      usuarioAtual: async () => null, // simula visitante anônimo na entrega pública e mídia
      exigirEditor: async () => ({ id: "ed-1", tenantId: "t-test", role: "EDITOR", isSuperAdmin: false }),
      exigirSessao: async () => ({ id: "ed-1", tenantId: "t-test", role: "EDITOR", isSuperAdmin: false }),
      exigirAdmin: async () => ({ id: "ed-1", tenantId: "t-test", role: "ADMIN", isSuperAdmin: false }),
    };
  }
  if (request === "@/lib/prisma" || request === "./prisma" || request === "../lib/prisma") {
    return { __esModule: true, default: mockPrisma, prisma: mockPrisma };
  }
  if (request === "@/lib/lp") {
    return {
      htmlAutocontido: async () => lpRow.draftHtml,
      lerLP: async () => ({ ...lpRow, status: lpRow.status === LPStatus.PUBLISHED ? "publicada" : "rascunho" }),
    };
  }
  if (request === "@/lib/redis" || request === "./redis") {
    return {
      normalizeHostname: (h: string) => h.trim().toLowerCase(),
      checkRateLimit: async () => ({ allowed: true, remaining: 14, retryAfterSeconds: 0 }),
      invalidateDomainMapping: async () => {},
      getDomainMapping: async (host: string) =>
        host === "lp.garapalabs.com"
          ? { tenantId: "t-test", tenantSlug: "stage-consulting", customDomainId: "dom-garapa", isFallback: false }
          : null,
    };
  }
  if (request === "@/lib/seo-analyzer") {
    return {
      analyzeLandingPageSeo: () => ({ score: 92, grade: "A", extracted: { title: "LP", metaDescription: "Desc" } }),
    };
  }
  if (request === "@/lib/storage" || request === "../lib/storage") {
    return {
      StorageConfigError: MockStorageConfigError,
      StorageOperationError: MockStorageOperationError,
      isHtmlLpSnapshotAsset: (a: { category?: string; mimeType?: string }) =>
        a.category === "lp_asset" && Boolean(a.mimeType?.startsWith("text/html")),
      verifySignedMediaToken: () => false,
      signMediaAssetPath: (p: string) => p,
      uploadTenantAsset: async (params: { buffer: Buffer; mimeType: string }) => {
        blobSeq++;
        const blobUrl = `https://storage.blob.core.windows.net/assets/t-test/lp_asset/2026-11/snap-${blobSeq}.html`;
        blobs.set(blobUrl, { buffer: params.buffer, mimeType: params.mimeType });
        return { id: `asset-snap-${blobSeq}`, blobUrl };
      },
      downloadTenantAssetBuffer: async (blobUrl: string) => blobs.get(blobUrl) ?? null,
      deleteTenantAssetBlob: async (blobUrl: string) => {
        blobs.delete(blobUrl);
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST: publishPost, DELETE: unpublishDel } = require("../src/app/api/lp/[slug]/publicar/route") as {
  POST: (req: Request, ctx: { params: Promise<{ slug: string }> }) => Promise<Response>;
  DELETE: (req: Request, ctx: { params: Promise<{ slug: string }> }) => Promise<Response>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST: domainsPost } = require("../src/app/api/domains/route") as {
  POST: (req: Request) => Promise<Response>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { proxy } = require("../src/proxy") as { proxy: (req: NextRequest) => Promise<Response> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GET: publicGet } = require("../src/app/lp-public/[host]/[slug]/route") as {
  GET: (req: Request, ctx: { params: Promise<{ host: string; slug: string }> }) => Promise<Response>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GET: mediaGet } = require("../src/app/api/media/[id]/route") as {
  GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST: leadsPost } = require("../src/app/api/public/leads/route") as {
  POST: (req: Request) => Promise<Response>;
};

process.env.STAGE_WORKER_DISABLE_AUTORUN = "1";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { processPendingLeadNotifications } = require("../src/worker/index") as {
  processPendingLeadNotifications: () => Promise<void>;
};

async function openPublicUrl(path: string): Promise<Response> {
  const host = "lp.garapalabs.com";
  const proxyRes = await proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }));
  const rewriteTarget = proxyRes.headers.get("x-middleware-rewrite");
  if (!rewriteTarget) return proxyRes;
  const parsed = new URL(rewriteTarget);
  const parts = parsed.pathname.replace(/^\/lp-public\//, "").split("/");
  const headers = new Headers();
  headers.set("host", host);
  for (const [k, v] of proxyRes.headers.entries()) {
    if (k.startsWith("x-middleware-request-")) {
      headers.set(k.slice("x-middleware-request-".length), v);
    }
  }
  return publicGet(new Request(parsed.toString(), { headers }), {
    params: Promise.resolve({ host: parts[0] ?? "", slug: parts[1] ?? "" }),
  });
}

describe("Ciclo E2E local com LP sintética (simulação do Prompt 29)", () => {
  beforeEach(() => {
    process.env.APP_PANEL_HOST = "172.212.145.134";
    process.env.APP_BASE_URL = "http://172.212.145.134";
    process.env.LP_FALLBACK_ENABLED = "false";
    process.env.TRUSTED_PROXY = "0";
    delete process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
    delete process.env.RESEND_MASTER_API_KEY;
    resetFixtures();
  });

  it("publica, serve /slug e / (home), carrega mídia sem HTTP do painel, captura lead até fila, preserva snapshot ao editar rascunho, republica e despublica", async () => {
    // 1. Publicar V1
    const pub1 = await publishPost(
      new Request("http://172.212.145.134/api/lp/lp-sintetica-teste/publicar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customDomainId: "dom-garapa" }),
      }),
      { params: Promise.resolve({ slug: "lp-sintetica-teste" }) }
    );
    assert.equal(pub1.status, 200);
    const pub1Json = await pub1.json();
    assert.equal(pub1Json.publicUrl, "https://lp.garapalabs.com/lp-sintetica-teste");

    // 2. Abrir /slug anonimamente e conferir conteúdo, imagem e ausência de http://172.212.145.134
    const resSlug = await openPublicUrl("/lp-sintetica-teste");
    assert.equal(resSlug.status, 200);
    const html1 = await resSlug.text();
    assert.match(html1, /Oferta V1/);
    assert.doesNotMatch(html1, /http:\/\/172\.212\.145\.134/);

    const imgRes = await mediaGet(
      new Request("https://lp.garapalabs.com/api/media/asset-hero-1", {
        headers: { host: "lp.garapalabs.com" },
      }),
      { params: Promise.resolve({ id: "asset-hero-1" }) }
    );
    assert.equal(imgRes.status, 200);

    // 3. Definir página inicial e conferir raiz /
    const setHome = await domainsPost(
      new Request("http://172.212.145.134/api/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "setHome", domainId: "dom-garapa", landingPageId: "lp-synth-1" }),
      })
    );
    assert.equal(setHome.status, 200);
    const resRoot = await openPublicUrl("/");
    assert.equal(resRoot.status, 200);
    assert.match(await resRoot.text(), /Oferta V1/);

    // 4. Enviar formulário com dados sintéticos e processar fila no worker (sem destinatário real -> entrega externa pendente)
    const leadRes = await leadsPost(
      new Request("https://lp.garapalabs.com/api/public/leads", {
        method: "POST",
        headers: { host: "lp.garapalabs.com", "content-type": "application/json" },
        body: JSON.stringify({
          landingPageId: "lp-synth-1",
          slug: "lp-sintetica-teste",
          name: "Contato Sintético",
          email: "sintetico@exemplo.invalid",
          utmData: { utm_source: "e2e" },
        }),
      })
    );
    assert.equal(leadRes.status, 200);
    assert.equal(leads.length, 1);
    assert.equal(leads[0].tenantId, "t-test");
    assert.equal(leads[0].landingPageId, "lp-synth-1");
    assert.ok(["queued", "sending", "failed"].includes(leads[0].emailDeliveryStatus));

    await processPendingLeadNotifications();
    assert.equal(leads[0].emailDeliveryStatus, "config_pending"); // sem destinatário/Resend real configurado

    // 5. Editar rascunho V2 sem republicar -> pública continua V1
    lpRow.draftHtml = "<html><head><title>Versao 2</title></head><body><h1>Oferta V2</h1></body></html>";
    const stillV1 = await openPublicUrl("/lp-sintetica-teste");
    assert.equal(stillV1.status, 200);
    const stillV1Html = await stillV1.text();
    assert.match(stillV1Html, /Oferta V1/);
    assert.doesNotMatch(stillV1Html, /Oferta V2/);

    // 6. Republicar V2 -> pública atualiza para V2
    const pub2 = await publishPost(
      new Request("http://172.212.145.134/api/lp/lp-sintetica-teste/publicar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customDomainId: "dom-garapa" }),
      }),
      { params: Promise.resolve({ slug: "lp-sintetica-teste" }) }
    );
    assert.equal(pub2.status, 200);
    const nowV2 = await openPublicUrl("/lp-sintetica-teste");
    assert.equal(nowV2.status, 200);
    assert.match(await nowV2.text(), /Oferta V2/);

    // 7. Despublicar -> novas requisições em /slug e / retornam 404, e mídia retorna 403
    const unpub = await unpublishDel(
      new Request("http://172.212.145.134/api/lp/lp-sintetica-teste/publicar", { method: "DELETE" }),
      { params: Promise.resolve({ slug: "lp-sintetica-teste" }) }
    );
    assert.equal(unpub.status, 200);
    assert.equal((await openPublicUrl("/lp-sintetica-teste")).status, 404);
    assert.equal((await openPublicUrl("/")).status, 404);
    assert.equal(
      (
        await mediaGet(
          new Request("https://lp.garapalabs.com/api/media/asset-hero-1", {
            headers: { host: "lp.garapalabs.com" },
          }),
          { params: Promise.resolve({ id: "asset-hero-1" }) }
        )
      ).status,
      403
    );
  });
});
