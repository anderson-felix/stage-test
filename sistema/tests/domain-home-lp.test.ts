import assert from "node:assert/strict";
import Module from "node:module";
import { beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { DnsStatus, LPStatus, SslStatus } from "@prisma/client";

type DomainRecord = {
  id: string;
  tenantId: string;
  domain: string;
  dnsStatus: DnsStatus;
  sslStatus: SslStatus;
  homeLandingPageId: string | null;
};

type LpRecord = {
  id: string;
  tenantId: string;
  customDomainId: string | null;
  slug: string;
  title: string;
  status: LPStatus;
  publishedBlobUrl: string | null;
  briefingData: Record<string, unknown>;
  seoMetadata: Record<string, unknown> | null;
  trackingConfig: Record<string, unknown> | null;
};

let authSession: { id: string; tenantId: string; role: string; isSuperAdmin: boolean } | Response;
let domains: DomainRecord[];
let lps: LpRecord[];
let invalidatedHosts: string[];

function resetFixtures(): void {
  authSession = {
    id: "user-1",
    tenantId: "tenant-1",
    role: "EDITOR",
    isSuperAdmin: false,
  };
  domains = [
    {
      id: "dom-1",
      tenantId: "tenant-1",
      domain: "site1.cliente1.com",
      dnsStatus: DnsStatus.VERIFIED,
      sslStatus: SslStatus.ACTIVE,
      homeLandingPageId: null,
    },
    {
      id: "dom-2",
      tenantId: "tenant-1",
      domain: "site2.cliente1.com",
      dnsStatus: DnsStatus.VERIFIED,
      sslStatus: SslStatus.ACTIVE,
      homeLandingPageId: null,
    },
    {
      id: "dom-3",
      tenantId: "tenant-2",
      domain: "site.cliente2.com",
      dnsStatus: DnsStatus.VERIFIED,
      sslStatus: SslStatus.ACTIVE,
      homeLandingPageId: null,
    },
  ];
  lps = [
    {
      id: "lp-1",
      tenantId: "tenant-1",
      customDomainId: "dom-1",
      slug: "oferta-principal",
      title: "Oferta Principal",
      status: LPStatus.PUBLISHED,
      publishedBlobUrl: "https://storage.blob.core.windows.net/assets/tenant-1/lp_asset/2026-11/oferta.html",
      briefingData: { legacyStatus: "publicada" },
      seoMetadata: null,
      trackingConfig: null,
    },
    {
      id: "lp-other-domain",
      tenantId: "tenant-1",
      customDomainId: "dom-2",
      slug: "oferta-dom2",
      title: "Oferta Dom 2",
      status: LPStatus.PUBLISHED,
      publishedBlobUrl: "https://storage.blob.core.windows.net/assets/tenant-1/lp_asset/2026-11/dom2.html",
      briefingData: { legacyStatus: "publicada" },
      seoMetadata: null,
      trackingConfig: null,
    },
    {
      id: "lp-draft",
      tenantId: "tenant-1",
      customDomainId: "dom-1",
      slug: "rascunho",
      title: "Rascunho",
      status: LPStatus.DRAFT,
      publishedBlobUrl: null,
      briefingData: { legacyStatus: "rascunho" },
      seoMetadata: null,
      trackingConfig: null,
    },
    {
      id: "lp-tenant2",
      tenantId: "tenant-2",
      customDomainId: "dom-3",
      slug: "oferta-t2",
      title: "Oferta T2",
      status: LPStatus.PUBLISHED,
      publishedBlobUrl: "https://storage.blob.core.windows.net/assets/tenant-2/lp_asset/2026-11/t2.html",
      briefingData: { legacyStatus: "publicada" },
      seoMetadata: null,
      trackingConfig: null,
    },
  ];
  invalidatedHosts = [];
}

const mockPrisma: {
  customDomain: {
    findFirst: (args: {
      where?: {
        id?: string;
        tenantId?: string;
        homeLandingPageId?: string | null | { not: null };
      };
      select?: { homeLandingPage?: boolean };
    }) => Promise<unknown>;
    update: (args: { where: { id: string }; data: { homeLandingPageId: string | null } }) => Promise<DomainRecord>;
    updateMany: (args: {
      where: { tenantId?: string; homeLandingPageId?: string; id?: { not: string } };
      data: { homeLandingPageId: string | null };
    }) => Promise<{ count: number }>;
  };
  landingPage: {
    findFirst: (args: {
      where?: {
        id?: string;
        tenantId?: string;
        customDomainId?: string | null;
        slug?: string;
        status?: LPStatus;
      };
    }) => Promise<LpRecord | null>;
    findUnique: (args: {
      where: { tenantId_slug: { tenantId: string; slug: string } };
    }) => Promise<(LpRecord & { tenant: { slug: string }; customDomain: DomainRecord | null }) | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<LpRecord>;
  };
  $transaction: <T>(fn: (tx: typeof mockPrisma) => Promise<T>) => Promise<T>;
} = {
  customDomain: {
    findFirst: async (args) => {
      const w = args?.where ?? {};
      const found =
        domains.find(
          (d) =>
            (w.id === undefined || d.id === w.id) &&
            (w.tenantId === undefined || d.tenantId === w.tenantId) &&
            (w.homeLandingPageId === undefined ||
              (typeof w.homeLandingPageId === "object" && w.homeLandingPageId !== null && "not" in w.homeLandingPageId
                ? d.homeLandingPageId !== null
                : d.homeLandingPageId === w.homeLandingPageId))
        ) ?? null;
      if (!found) return null;
      if (args?.select?.homeLandingPage) {
        return {
          ...found,
          homeLandingPage: lps.find((l) => l.id === found.homeLandingPageId) ?? null,
        };
      }
      return found;
    },
    update: async (args) => {
      const idx = domains.findIndex((d) => d.id === args.where.id);
      if (idx === -1) throw new Error("Domain not found");
      domains[idx] = { ...domains[idx], homeLandingPageId: args.data.homeLandingPageId };
      return domains[idx];
    },
    updateMany: async (args) => {
      let count = 0;
      for (const d of domains) {
        const matchTenant = args.where.tenantId === undefined || d.tenantId === args.where.tenantId;
        const matchHome =
          args.where.homeLandingPageId === undefined || d.homeLandingPageId === args.where.homeLandingPageId;
        const matchNotId = args.where.id?.not === undefined || d.id !== args.where.id.not;
        if (matchTenant && matchHome && matchNotId) {
          d.homeLandingPageId = args.data.homeLandingPageId;
          count++;
        }
      }
      return { count };
    },
  },
  landingPage: {
    findFirst: async (args) => {
      const w = args?.where ?? {};
      return (
        lps.find(
          (l) =>
            (w.id === undefined || l.id === w.id) &&
            (w.tenantId === undefined || l.tenantId === w.tenantId) &&
            (w.customDomainId === undefined || l.customDomainId === w.customDomainId) &&
            (w.slug === undefined || l.slug === w.slug) &&
            (w.status === undefined || l.status === w.status)
        ) ?? null
      );
    },
    findUnique: async (args) => {
      const { tenantId, slug } = args.where.tenantId_slug;
      const found = lps.find((l) => l.tenantId === tenantId && l.slug === slug);
      if (!found) return null;
      return {
        ...found,
        tenant: { slug: "cliente1" },
        customDomain: domains.find((d) => d.id === found.customDomainId) ?? null,
      };
    },
    update: async (args) => {
      const idx = lps.findIndex((l) => l.id === args.where.id);
      if (idx === -1) throw new Error("LP not found");
      lps[idx] = { ...lps[idx], ...(args.data as Partial<LpRecord>) };
      return lps[idx];
    },
  },
  $transaction: async (fn) => fn(mockPrisma),
};

class MockStorageConfigError extends Error {
  statusCode = 503;
  code = "STORAGE_CONFIG_ERROR";
}
class MockStorageOperationError extends Error {
  statusCode = 503;
  code = "STORAGE_READ_FAILED";
}

const originalLoad = (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load;

(Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "@/lib/auth") {
    return {
      exigirSessao: async () => authSession,
      exigirEditor: async () => authSession,
      exigirAdmin: async () => authSession,
    };
  }
  if (request === "@/lib/prisma" || request === "./prisma") {
    return { __esModule: true, default: mockPrisma, prisma: mockPrisma };
  }
  if (request === "@/lib/redis" || request === "./redis") {
    return {
      checkRateLimit: async () => ({ allowed: true, remaining: 5, retryAfterSeconds: 0 }),
      normalizeHostname: (h: string) => h.trim().toLowerCase(),
      invalidateDomainMapping: async (host: string) => {
        invalidatedHosts.push(host);
      },
      getDomainMapping: async (host: string) => {
        const d = domains.find((x) => x.domain === host);
        if (!d) return null;
        return {
          tenantId: d.tenantId,
          tenantSlug: d.tenantId,
          customDomainId: d.id,
          isFallback: false,
        };
      },
    };
  }
  if (request === "@/lib/storage") {
    return {
      StorageConfigError: MockStorageConfigError,
      StorageOperationError: MockStorageOperationError,
      uploadTenantAsset: async () => ({ id: "a1", blobUrl: "https://storage.blob.core.windows.net/assets/t/lp/x.html" }),
      deleteTenantAssetBlob: async () => {},
      downloadTenantAssetBuffer: async (blobUrl: string) => ({
        buffer: Buffer.from(`<html><head></head><body><h1>${blobUrl}</h1></body></html>`, "utf8"),
        mimeType: "text/html",
      }),
    };
  }
  if (request === "@/lib/brand-assets") {
    return { resolveLpHtmlAssets: async (html: string) => html };
  }
  if (request === "@/lib/lp") {
    return {
      htmlAutocontido: async () => "<html></html>",
      lerLP: async (slug: string, tenantId: string) => lps.find((l) => l.slug === slug && l.tenantId === tenantId) ?? null,
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST: domainsPost } = require("../src/app/api/domains/route") as {
  POST: (req: Request) => Promise<Response>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DELETE: lpUnpublish } = require("../src/app/api/lp/[slug]/publicar/route") as {
  DELETE: (req: Request, ctx: { params: Promise<{ slug: string }> }) => Promise<Response>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { proxy } = require("../src/proxy") as {
  proxy: (req: NextRequest) => Promise<Response>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GET: lpPublicGet } = require("../src/app/lp-public/[host]/[slug]/route") as {
  GET: (req: Request, ctx: { params: Promise<{ host: string; slug: string }> }) => Promise<Response>;
};

async function requestRoot(host: string): Promise<Response> {
  const proxyRes = await proxy(
    new NextRequest(`https://${host}/`, { headers: { host } })
  );
  const rewriteTarget = proxyRes.headers.get("x-middleware-rewrite");
  assert.ok(rewriteTarget);
  const parsedRewrite = new URL(rewriteTarget);
  const parts = parsedRewrite.pathname.replace(/^\/lp-public\//, "").split("/");
  const forwardedHeaders = new Headers();
  forwardedHeaders.set("host", host);
  for (const [k, v] of proxyRes.headers.entries()) {
    if (k.startsWith("x-middleware-request-")) {
      forwardedHeaders.set(k.slice("x-middleware-request-".length), v);
    }
  }
  return lpPublicGet(new Request(parsedRewrite.toString(), { headers: forwardedHeaders }), {
    params: Promise.resolve({ host: parts[0] ?? "", slug: parts[1] ?? "" }),
  });
}

describe("LP inicial explícita por domínio (Prompts 15-16)", () => {
  beforeEach(() => {
    process.env.APP_PANEL_HOST = "172.212.145.134";
    process.env.APP_BASE_URL = "http://172.212.145.134";
    process.env.LP_FALLBACK_ENABLED = "false";
    process.env.TRUSTED_PROXY = "0";
    resetFixtures();
  });

  it("sem seleção explícita, raiz / retorna 404 mesmo havendo LPs publicadas no domínio", async () => {
    const res = await requestRoot("site1.cliente1.com");
    assert.equal(res.status, 404);
  });

  it("permite seleção válida de LP publicada do mesmo tenant e domínio e serve na raiz /", async () => {
    const setRes = await domainsPost(
      new Request("http://172.212.145.134/api/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "setHome",
          domainId: "dom-1",
          landingPageId: "lp-1",
        }),
      })
    );
    assert.equal(setRes.status, 200);
    const body = await setRes.json();
    assert.equal(body.home.homeLandingPageId, "lp-1");
    assert.ok(invalidatedHosts.includes("site1.cliente1.com"));

    const rootRes = await requestRoot("site1.cliente1.com");
    assert.equal(rootRes.status, 200);
    assert.match(await rootRes.text(), /oferta\.html/);

    // Outro domínio do mesmo tenant não é afetado
    const otherRootRes = await requestRoot("site2.cliente1.com");
    assert.equal(otherRootRes.status, 404);
  });

  it("rejeita LP de outro domínio do mesmo tenant", async () => {
    const res = await domainsPost(
      new Request("http://172.212.145.134/api/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "setHome",
          domainId: "dom-1",
          landingPageId: "lp-other-domain",
        }),
      })
    );
    assert.equal(res.status, 400);
    assert.equal(domains[0].homeLandingPageId, null);
  });

  it("rejeita LP de outra empresa e LP não publicada", async () => {
    const otherTenantRes = await domainsPost(
      new Request("http://172.212.145.134/api/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "setHome",
          domainId: "dom-1",
          landingPageId: "lp-tenant2",
        }),
      })
    );
    assert.equal(otherTenantRes.status, 404);

    const draftRes = await domainsPost(
      new Request("http://172.212.145.134/api/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "setHome",
          domainId: "dom-1",
          landingPageId: "lp-draft",
        }),
      })
    );
    assert.equal(draftRes.status, 400);
  });

  it("exige autorização para alterar a associação", async () => {
    authSession = Response.json({ error: "Permissão insuficiente" }, { status: 403 });
    const res = await domainsPost(
      new Request("http://172.212.145.134/api/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "setHome",
          domainId: "dom-1",
          landingPageId: "lp-1",
        }),
      })
    );
    assert.equal(res.status, 403);
    assert.equal(domains[0].homeLandingPageId, null);
  });

  it("ao despublicar a LP inicial, limpa a associação e a raiz / passa a retornar 404 sem afetar outras LPs", async () => {
    domains[0].homeLandingPageId = "lp-1";
    const beforeRoot = await requestRoot("site1.cliente1.com");
    assert.equal(beforeRoot.status, 200);

    const unpubRes = await lpUnpublish(
      new Request("http://172.212.145.134/api/lp/oferta-principal/publicar", { method: "DELETE" }),
      { params: Promise.resolve({ slug: "oferta-principal" }) }
    );
    assert.equal(unpubRes.status, 200);
    assert.equal(domains[0].homeLandingPageId, null);
    // Outra LP permanece publicada
    assert.equal(lps[1].status, LPStatus.PUBLISHED);

    const afterRoot = await requestRoot("site1.cliente1.com");
    assert.equal(afterRoot.status, 404);
  });
});

