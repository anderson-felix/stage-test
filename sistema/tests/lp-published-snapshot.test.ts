import assert from "node:assert/strict";
import Module from "node:module";
import { beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { DnsStatus, LPStatus, SslStatus } from "@prisma/client";

class MockStorageConfigError extends Error {
  statusCode = 503;
  code = "STORAGE_CONFIG_ERROR";
}

class MockStorageOperationError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, code = "STORAGE_READ_FAILED", statusCode = 503) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

type LpState = {
  publishedMetadata?: Record<string, unknown> | null;
  id: string;
  tenantId: string;
  customDomainId: string | null;
  slug: string;
  title: string;
  draftHtml: string;
  publishedBlobUrl: string | null;
  status: LPStatus;
  publishedAt: Date | null;
  briefingData: Record<string, unknown>;
  trackingConfig: Record<string, unknown> | null;
  seoMetadata: Record<string, unknown> | null;
};

let lpState: LpState;
let blobStore: Map<string, string>;
let blobCounter = 0;
let brandAssetResolverCalledOnPublicRead = false;
let simulateUploadError: Error | null = null;
let simulateReadError: Error | null = null;

const validDomain = {
  id: "dom-1",
  tenantId: "tenant-1",
  domain: "lp.cliente.com.br",
  dnsStatus: DnsStatus.VERIFIED,
  sslStatus: SslStatus.ACTIVE,
};

function resetState(): void {
  blobCounter = 0;
  blobStore = new Map();
  brandAssetResolverCalledOnPublicRead = false;
  simulateUploadError = null;
  simulateReadError = null;
  lpState = {
    id: "lp-1",
    tenantId: "tenant-1",
    customDomainId: "dom-1",
    slug: "produto-x",
    title: "Produto X",
    draftHtml: "<html><head><title>V1</title></head><body><h1>Versao A</h1><img src=\"/logo-stage.png\" /></body></html>",
    publishedBlobUrl: null,
    status: LPStatus.DRAFT,
    publishedAt: null,
    briefingData: { legacyStatus: "rascunho" },
    trackingConfig: null,
    seoMetadata: null,
  };
}

const mockPrisma: {
  landingPage: {
    findUnique: () => Promise<Record<string, unknown>>;
    findFirst: (args: { where?: { status?: LPStatus; slug?: string } }) => Promise<LpState | null>;
    update: (args: { data: Partial<LpState> }) => Promise<LpState>;
  };
  customDomain: {
    findFirst: () => Promise<typeof validDomain>;
    updateMany: () => Promise<{ count: number }>;
  };
  tenant: {
    findUnique: () => Promise<{ id: string; isActive: boolean }>;
  };
  mediaAsset: {
    delete: () => Promise<{ id: string }>;
  };
  $transaction: <T>(fn: (tx: typeof mockPrisma) => Promise<T>) => Promise<T>;
} = {
  landingPage: {
    findUnique: async () => ({
      ...lpState,
      tenant: { id: "tenant-1", slug: "cliente", isActive: true },
      customDomain: validDomain,
    }),
    findFirst: async (args) => {
      const w = args?.where ?? {};
      if (w.status && lpState.status !== w.status) return null;
      if (w.slug && lpState.slug !== w.slug) return null;
      return { ...lpState };
    },
    update: async (args) => {
      lpState = { ...lpState, ...args.data };
      return lpState;
    },
  },
  customDomain: {
    findFirst: async () => validDomain,
    updateMany: async () => ({ count: 0 }),
  },
  tenant: {
    findUnique: async () => ({ id: "tenant-1", isActive: true }),
  },
  mediaAsset: {
    delete: async () => ({ id: "deleted" }),
  },
  $transaction: async (fn) => fn(mockPrisma),
};

const originalLoad = (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load;

(Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "@/lib/auth") {
    return {
      exigirEditor: async () => ({
        id: "user-1",
        email: "editor@cliente.com.br",
        role: "EDITOR",
        tenantId: "tenant-1",
        isSuperAdmin: false,
      }),
    };
  }
  if (request === "@/lib/prisma" || request === "./prisma") {
    return { __esModule: true, default: mockPrisma, prisma: mockPrisma };
  }
  if (request === "@/lib/lp") {
    return {
      htmlAutocontido: async () => lpState.draftHtml.replace("/logo-stage.png", "data:image/png;base64,FROZEN_A"),
      lerLP: async () => ({ ...lpState }),
    };
  }
  if (request === "@/lib/redis") {
    return {
      invalidateDomainMapping: async () => {},
      getDomainMapping: async (host: string) =>
        host === "lp.cliente.com.br"
          ? { tenantId: "tenant-1", tenantSlug: "cliente", customDomainId: "dom-1", isFallback: false }
          : null,
    };
  }
  if (request === "@/lib/seo-analyzer") {
    return {
      analyzeLandingPageSeo: () => ({
        score: 95,
        grade: "A",
        extracted: { title: "Produto X", metaDescription: "Desc" },
      }),
    };
  }
  if (request === "@/lib/storage") {
    return {
      StorageConfigError: MockStorageConfigError,
      StorageOperationError: MockStorageOperationError,
      uploadTenantAsset: async (params: { buffer: Buffer }) => {
        if (simulateUploadError) throw simulateUploadError;
        blobCounter++;
        const blobUrl = `https://storage.blob.core.windows.net/assets/tenant-1/lp_asset/2026-11/snap-${blobCounter}.html`;
        blobStore.set(blobUrl, params.buffer.toString("utf8"));
        return { id: `asset-${blobCounter}`, blobUrl };
      },
      downloadTenantAssetBuffer: async (blobUrl: string) => {
        if (simulateReadError) throw simulateReadError;
        const content = blobStore.get(blobUrl);
        if (!content) return null;
        return { buffer: Buffer.from(content, "utf8"), mimeType: "text/html" };
      },
      deleteTenantAssetBlob: async (blobUrl: string) => {
        blobStore.delete(blobUrl);
      },
    };
  }
  if (request === "@/lib/brand-assets") {
    return {
      resolveLpHtmlAssets: async (html: string) => {
        brandAssetResolverCalledOnPublicRead = true;
        return html;
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST: publishPost } = require("../src/app/api/lp/[slug]/publicar/route") as {
  POST: (req: Request, ctx: { params: Promise<{ slug: string }> }) => Promise<Response>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { proxy } = require("../src/proxy") as {
  proxy: (req: NextRequest) => Promise<Response>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GET: publicGet } = require("../src/app/lp-public/[host]/[slug]/route") as {
  GET: (req: Request, ctx: { params: Promise<{ host: string; slug: string }> }) => Promise<Response>;
};

async function fetchPublicLp(slug: string): Promise<Response> {
  const host = "lp.cliente.com.br";
  const proxyRes = await proxy(
    new NextRequest(`https://${host}/${slug}`, { headers: { host } })
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
  return publicGet(new Request(parsedRewrite.toString(), { headers: forwardedHeaders }), {
    params: Promise.resolve({ host: parts[0] ?? "", slug: parts[1] ?? "" }),
  });
}

describe("Integridade do snapshot publicado (Prompt 17)", () => {
  beforeEach(() => {
    process.env.APP_PANEL_HOST = "172.212.145.134";
    process.env.APP_BASE_URL = "http://172.212.145.134";
    process.env.LP_FALLBACK_ENABLED = "false";
    process.env.TRUSTED_PROXY = "0";
    resetState();
  });

  it("serve exatamente a versão A após editar rascunho B, falha fechado se Blob falhar e atualiza apenas após republicar B", async () => {
    // 1. Publica versão A
    const pubA = await publishPost(
      new Request("http://172.212.145.134/api/lp/produto-x/publicar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customDomainId: "dom-1" }),
      }),
      { params: Promise.resolve({ slug: "produto-x" }) }
    );
    assert.equal(pubA.status, 200);
    const pubAData = await pubA.json();
    const blobUrlA = pubAData.publishedBlobUrl as string;

    const frozen = structuredClone(lpState.publishedMetadata);
    lpState.seoMetadata = { description: "SEO_B" };
    lpState.trackingConfig = { gtmId: "GTM-BBBBB" };
    // 2. Edita rascunho para B sem republicar
    lpState.draftHtml = "<html><head><title>V2</title></head><body><h1>Versao B Rascunho</h1></body></html>";

    // 3. Acessa publicamente e comprova que recebe A (congelado) e não B nem reprocessa marca
    const getA = await fetchPublicLp("produto-x");
    assert.equal(getA.status, 200);
    const htmlA = await getA.text();
    assert.match(htmlA, /Versao A/);
    assert.match(htmlA, /FROZEN_A/);
    assert.doesNotMatch(htmlA, /Versao B Rascunho/);
    assert.equal(brandAssetResolverCalledOnPublicRead, false);
    assert.doesNotMatch(htmlA, /SEO_B|GTM-BBBBB/);
    assert.deepEqual(lpState.publishedMetadata, frozen);

    // 4. Tentativa de republicação malsucedida preserva A
    simulateUploadError = new MockStorageOperationError("Azure indisponível", "STORAGE_UPLOAD_FAILED", 503);
    const failedPubB = await publishPost(
      new Request("http://172.212.145.134/api/lp/produto-x/publicar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customDomainId: "dom-1" }),
      }),
      { params: Promise.resolve({ slug: "produto-x" }) }
    );
    assert.equal(failedPubB.status, 503);
    assert.equal(lpState.publishedBlobUrl, blobUrlA);
    simulateUploadError = null;

    // 5. Simula falha de leitura no Blob Storage e comprova que retorna 503 sem expor rascunho B
    simulateReadError = new MockStorageOperationError("Blob timeout", "STORAGE_READ_FAILED", 503);
    const failedRead = await fetchPublicLp("produto-x");
    assert.equal(failedRead.status, 503);
    const failedBody = await failedRead.text();
    assert.doesNotMatch(failedBody, /Versao B Rascunho/);
    simulateReadError = null;

    // 6. Republica B com sucesso e confirma que o acesso público passa a servir B
    const pubB = await publishPost(
      new Request("http://172.212.145.134/api/lp/produto-x/publicar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customDomainId: "dom-1" }),
      }),
      { params: Promise.resolve({ slug: "produto-x" }) }
    );
    assert.equal(pubB.status, 200);

    const getB = await fetchPublicLp("produto-x");
    assert.equal(getB.status, 200);
    const htmlB = await getB.text();
    assert.match(htmlB, /Versao B Rascunho/);
    assert.match(htmlB, /SEO_B/);
    assert.match(htmlB, /GTM-BBBBB/);
    assert.doesNotMatch(htmlB, /Versao A/);
    // Registro antigo: nenhum backfill a partir dos metadados editáveis atuais.
    lpState.publishedMetadata = null;
    const legacy = await fetchPublicLp("produto-x");
    assert.doesNotMatch(await legacy.text(), /SEO_B|GTM-BBBBB/);
  });
});

