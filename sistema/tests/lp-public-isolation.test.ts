import assert from "node:assert/strict";
import Module from "node:module";
import { beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { LPStatus } from "@prisma/client";

type DomainEntry = {
  tenantId: string;
  tenantSlug: string;
  customDomainId: string | null;
  isFallback: boolean;
};

type LpEntry = {
  id: string;
  tenantId: string;
  customDomainId: string | null;
  slug: string;
  title: string;
  status: LPStatus;
  publishedBlobUrl: string;
  seoMetadata: Record<string, unknown> | null;
  trackingConfig: Record<string, unknown> | null;
};

const DOMAINS: Record<string, DomainEntry | null> = {
  "a.cliente1.com": { tenantId: "tenant-1", tenantSlug: "cliente1", customDomainId: "dom-a", isFallback: false },
  "b.cliente1.com": { tenantId: "tenant-1", tenantSlug: "cliente1", customDomainId: "dom-b", isFallback: false },
  "c.cliente2.com": { tenantId: "tenant-2", tenantSlug: "cliente2", customDomainId: "dom-c", isFallback: false },
  "inativo.cliente3.com": null,
  "desconhecido.com": null,
};

const LPS: LpEntry[] = [
  {
    id: "lp-a",
    tenantId: "tenant-1",
    customDomainId: "dom-a",
    slug: "promo-a",
    title: "Promo A",
    status: LPStatus.PUBLISHED,
    publishedBlobUrl: "https://storage.blob.core.windows.net/assets/tenant-1/lp_asset/2026-11/promo-a.html",
    seoMetadata: null,
    trackingConfig: null,
  },
  {
    id: "lp-b",
    tenantId: "tenant-1",
    customDomainId: "dom-b",
    slug: "promo-b",
    title: "Promo B",
    status: LPStatus.PUBLISHED,
    publishedBlobUrl: "https://storage.blob.core.windows.net/assets/tenant-1/lp_asset/2026-11/promo-b.html",
    seoMetadata: null,
    trackingConfig: null,
  },
  {
    id: "lp-c",
    tenantId: "tenant-2",
    customDomainId: "dom-c",
    slug: "promo-c",
    title: "Promo C",
    status: LPStatus.PUBLISHED,
    publishedBlobUrl: "https://storage.blob.core.windows.net/assets/tenant-2/lp_asset/2026-11/promo-c.html",
    seoMetadata: null,
    trackingConfig: null,
  },
];

const mockPrisma: {
  customDomain: {
    findFirst: () => Promise<null>;
  };
  landingPage: {
    findFirst: (args: {
      where?: {
        tenantId?: string;
        customDomainId?: string | null;
        slug?: string;
        status?: LPStatus;
      };
    }) => Promise<LpEntry | null>;
    update: () => Promise<{ id: string }>;
  };
} = {
  customDomain: {
    findFirst: async () => null,
  },
  landingPage: {
    findFirst: async (args) => {
      const w = args?.where ?? {};
      return (
        LPS.find(
          (lp) =>
            (w.tenantId === undefined || lp.tenantId === w.tenantId) &&
            (w.customDomainId === undefined || lp.customDomainId === w.customDomainId) &&
            (w.slug === undefined || lp.slug === w.slug) &&
            (w.status === undefined || lp.status === w.status)
        ) ?? null
      );
    },
    update: async () => ({ id: "ok" }),
  },
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
  if (request === "@/lib/prisma") {
    return { __esModule: true, default: mockPrisma, prisma: mockPrisma };
  }
  if (request === "@/lib/redis") {
    return {
      getDomainMapping: async (host: string) => DOMAINS[host] ?? null,
    };
  }
  if (request === "@/lib/storage") {
    return {
      StorageConfigError: MockStorageConfigError,
      StorageOperationError: MockStorageOperationError,
      downloadTenantAssetBuffer: async (blobUrl: string) => ({
        buffer: Buffer.from(`<html><head></head><body><h1>${blobUrl}</h1></body></html>`, "utf8"),
        mimeType: "text/html",
      }),
    };
  }
  if (request === "@/lib/brand-assets") {
    return {
      resolveLpHtmlAssets: async (html: string) => html,
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { proxy, INTERNAL_LP_REWRITE_SIG_HEADER } = require("../src/proxy") as {
  proxy: (req: NextRequest) => Promise<Response>;
  INTERNAL_LP_REWRITE_SIG_HEADER: string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GET } = require("../src/app/lp-public/[host]/[slug]/route") as {
  GET: (req: Request, ctx: { params: Promise<{ host: string; slug: string }> }) => Promise<Response>;
};

async function simulatePublicFlow(
  host: string,
  pathAndQuery: string,
  extraHeaders: Record<string, string> = {}
): Promise<Response> {
  const url = `https://${host}${pathAndQuery}`;
  const req = new NextRequest(url, {
    headers: { host, ...extraHeaders },
  });
  const proxyRes = await proxy(req);
  const rewriteTarget = proxyRes.headers.get("x-middleware-rewrite");
  if (!rewriteTarget) {
    return proxyRes;
  }

  const parsedRewrite = new URL(rewriteTarget);
  const parts = parsedRewrite.pathname.replace(/^\/lp-public\//, "").split("/");
  const paramHost = parts[0] ?? "";
  const paramSlug = parts[1] ?? "";

  // Next.js repassa os headers de request sobrescritos pelo proxy (x-middleware-request-*)
  const forwardedHeaders = new Headers();
  forwardedHeaders.set("host", host);
  for (const [k, v] of proxyRes.headers.entries()) {
    if (k.startsWith("x-middleware-request-")) {
      forwardedHeaders.set(k.slice("x-middleware-request-".length), v);
    }
  }

  const routeReq = new Request(parsedRewrite.toString(), { headers: forwardedHeaders });
  return GET(routeReq, {
    params: Promise.resolve({ host: paramHost, slug: paramSlug }),
  });
}

describe("Isolamento de entrega pública de LPs (Prompt 14)", () => {
  beforeEach(() => {
    process.env.APP_PANEL_HOST = "172.212.145.134";
    process.env.APP_BASE_URL = "http://172.212.145.134";
    process.env.LP_FALLBACK_ENABLED = "false";
    process.env.TRUSTED_PROXY = "0";
  });

  it("isola LPs entre dois domínios do mesmo tenant e outro tenant", async () => {
    const resA = await simulatePublicFlow("a.cliente1.com", "/promo-a");
    assert.equal(resA.status, 200);
    assert.match(await resA.text(), /promo-a\.html/);

    // Mesmo tenant (tenant-1), mas outro domínio (dom-b): deve retornar 404
    const resAonB = await simulatePublicFlow("b.cliente1.com", "/promo-a");
    assert.equal(resAonB.status, 404);

    const resB = await simulatePublicFlow("b.cliente1.com", "/promo-b");
    assert.equal(resB.status, 200);
    assert.match(await resB.text(), /promo-b\.html/);

    // Outro tenant (tenant-2): deve servir apenas promo-c em c.cliente2.com
    const resC = await simulatePublicFlow("c.cliente2.com", "/promo-c");
    assert.equal(resC.status, 200);
    const resAonC = await simulatePublicFlow("c.cliente2.com", "/promo-a");
    assert.equal(resAonC.status, 404);
  });

  it("falha fechado (404) para domínio desconhecido ou empresa inativa", async () => {
    const unknownRes = await simulatePublicFlow("desconhecido.com", "/promo-a");
    assert.equal(unknownRes.status, 404);

    const inactiveRes = await simulatePublicFlow("inativo.cliente3.com", "/promo-a");
    assert.equal(inactiveRes.status, 404);
  });

  it("responde 404 na raiz (/) sem fallback para última LP do tenant", async () => {
    const rootRes = await simulatePublicFlow("a.cliente1.com", "/");
    assert.equal(rootRes.status, 404);
  });

  it("bloqueia acesso externo a /lp-public/OUTRO_HOST/slug em domínio público e no painel", async () => {
    const publicBypass = await proxy(
      new NextRequest("https://a.cliente1.com/lp-public/b.cliente1.com/promo-b", {
        headers: { host: "a.cliente1.com" },
      })
    );
    assert.equal(publicBypass.status, 404);

    const panelBypass = await proxy(
      new NextRequest("http://172.212.145.134/lp-public/a.cliente1.com/promo-a", {
        headers: { host: "172.212.145.134" },
      })
    );
    assert.equal(panelBypass.status, 404);
  });

  it("rejeita manipulação direta do parâmetro host e headers forjados em lp-public", async () => {
    // Chamada direta sem assinatura interna válida
    const noSig = await GET(
      new Request("http://127.0.0.1/lp-public/a.cliente1.com/promo-a", {
        headers: { host: "a.cliente1.com" },
      }),
      { params: Promise.resolve({ host: "a.cliente1.com", slug: "promo-a" }) }
    );
    assert.equal(noSig.status, 404);

    // Chamada direta com assinatura forjada
    const forgedSig = await GET(
      new Request("http://127.0.0.1/lp-public/a.cliente1.com/promo-a", {
        headers: {
          host: "a.cliente1.com",
          [INTERNAL_LP_REWRITE_SIG_HEADER]: "0".repeat(64),
        },
      }),
      { params: Promise.resolve({ host: "a.cliente1.com", slug: "promo-a" }) }
    );
    assert.equal(forgedSig.status, 404);

    // Tentativa de spoof via X-Forwarded-Host com TRUSTED_PROXY=0
    const spoofedForwarded = await simulatePublicFlow("a.cliente1.com", "/promo-b", {
      "x-forwarded-host": "b.cliente1.com",
      [INTERNAL_LP_REWRITE_SIG_HEADER]: "f".repeat(64),
    });
    assert.equal(spoofedForwarded.status, 404);
  });

  it("preserva query strings no rewrite e mantém rotas públicas /api/public e /api/media", async () => {
    const reqWithQuery = new NextRequest(
      "https://a.cliente1.com/promo-a?utm_source=meta&utm_campaign=teste",
      { headers: { host: "a.cliente1.com" } }
    );
    const rewriteRes = await proxy(reqWithQuery);
    const rewriteTarget = rewriteRes.headers.get("x-middleware-rewrite");
    assert.ok(rewriteTarget);
    const parsed = new URL(rewriteTarget);
    assert.equal(parsed.pathname, "/lp-public/a.cliente1.com/promo-a");
    assert.equal(parsed.search, "?utm_source=meta&utm_campaign=teste");

    const leadsRes = await proxy(
      new NextRequest("https://a.cliente1.com/api/public/leads", {
        method: "POST",
        headers: { host: "a.cliente1.com" },
      })
    );
    assert.equal(leadsRes.status, 200);
    assert.equal(leadsRes.headers.get("x-middleware-rewrite"), null);

    const mediaRes = await proxy(
      new NextRequest("https://a.cliente1.com/api/media/asset-1", {
        headers: { host: "a.cliente1.com" },
      })
    );
    assert.equal(mediaRes.status, 200);
    assert.equal(mediaRes.headers.get("x-middleware-rewrite"), null);
  });
});
