import assert from "node:assert/strict";
import Module from "node:module";
import { beforeEach, describe, it } from "node:test";
import { LPStatus } from "@prisma/client";

type AssetRecord = {
  id: string;
  tenantId: string;
  category: string;
  fileName: string;
  mimeType: string;
  blobUrl: string;
};

type LpRecord = {
  id: string;
  tenantId: string;
  customDomainId: string | null;
  status: LPStatus;
  publishedBlobUrl: string | null;
  publishedAssetIds: string[];
};

let currentSession: { id: string; tenantId: string; role: string; isSuperAdmin: boolean } | null = null;

const ASSETS: AssetRecord[] = [
  {
    id: "img-lp-a",
    tenantId: "tenant-1",
    category: "lp_asset",
    fileName: "hero.png",
    mimeType: "image/png",
    blobUrl: "https://storage.blob.core.windows.net/assets/tenant-1/lp_asset/2026-11/hero.png",
  },
  {
    id: "html-lp-a",
    tenantId: "tenant-1",
    category: "lp_asset",
    fileName: "oferta-a.html",
    mimeType: "text/html; charset=utf-8",
    blobUrl: "https://storage.blob.core.windows.net/assets/tenant-1/lp_asset/2026-11/oferta-a.html",
  },
  {
    id: "logo-unlinked",
    tenantId: "tenant-1",
    category: "logo",
    fileName: "logo.png",
    mimeType: "image/png",
    blobUrl: "https://storage.blob.core.windows.net/assets/tenant-1/logo/2026-11/logo.png",
  },
  {
    id: "social-slide-1",
    tenantId: "tenant-1",
    category: "social_slide",
    fileName: "slide1.png",
    mimeType: "image/png",
    blobUrl: "https://storage.blob.core.windows.net/assets/tenant-1/social_slide/2026-11/slide1.png",
  },
  {
    id: "img-tenant2",
    tenantId: "tenant-2",
    category: "lp_asset",
    fileName: "t2.png",
    mimeType: "image/png",
    blobUrl: "https://storage.blob.core.windows.net/assets/tenant-2/lp_asset/2026-11/t2.png",
  },
];

const LPS: LpRecord[] = [
  {
    id: "lp-a",
    tenantId: "tenant-1",
    customDomainId: "dom-a",
    status: LPStatus.PUBLISHED,
    publishedBlobUrl: "https://storage.blob.core.windows.net/assets/tenant-1/lp_asset/2026-11/oferta-a.html",
    publishedAssetIds: ["img-lp-a"],
  },
];

const DOMAINS: Record<string, { tenantId: string; tenantSlug: string; customDomainId: string | null; isFallback: boolean } | null> = {
  "a.cliente1.com": { tenantId: "tenant-1", tenantSlug: "cliente1", customDomainId: "dom-a", isFallback: false },
  "b.cliente1.com": { tenantId: "tenant-1", tenantSlug: "cliente1", customDomainId: "dom-b", isFallback: false },
  "c.cliente2.com": { tenantId: "tenant-2", tenantSlug: "cliente2", customDomainId: "dom-c", isFallback: false },
};

const mockPrisma = {
  tenant: { findUnique: async () => ({ isActive: signedTenantActive }) },
  mediaAsset: {
    findUnique: async (args: { where: { id: string } }) =>
      ASSETS.find((a) => a.id === args.where.id) ?? null,
    findFirst: async (args: { where: { id: string; tenantId: string } }) =>
      ASSETS.find((a) => a.id === args.where.id && a.tenantId === args.where.tenantId) ?? null,
  },
  landingPage: {
    findFirst: async (args: {
      where: {
        tenantId?: string;
        customDomainId?: string;
        status?: LPStatus;
        publishedBlobUrl?: { not: null };
        publishedAssetIds?: { has: string };
      };
    }) => {
      const w = args.where;
      return (
        LPS.find(
          (l) =>
            (w.tenantId === undefined || l.tenantId === w.tenantId) &&
            (w.customDomainId === undefined || l.customDomainId === w.customDomainId) &&
            (w.status === undefined || l.status === w.status) &&
            (!w.publishedBlobUrl || l.publishedBlobUrl !== null) &&
            (!w.publishedAssetIds?.has || l.publishedAssetIds.includes(w.publishedAssetIds.has))
        ) ?? null
      );
    },
  },
};
let signedTenantActive = true;

const originalLoad = (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load;

(Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "@/lib/auth") {
    return {
      usuarioAtual: async () => currentSession,
      exigirEditor: async () =>
        currentSession ?? Response.json({ error: "Não autenticado" }, { status: 401 }),
    };
  }
  if (request === "@/lib/prisma" || request === "./prisma") {
    return { __esModule: true, default: mockPrisma, prisma: mockPrisma };
  }
  if (request === "@/lib/redis") {
    return {
      normalizeHostname: (h: string) => h.trim().toLowerCase(),
      getDomainMapping: async (host: string) => DOMAINS[host] ?? null,
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const realStorage = require("../src/lib/storage") as typeof import("../src/lib/storage");
const { signMediaAssetPath } = realStorage;

const prevLoad = (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load;
(Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "@/lib/storage") {
    return {
      ...realStorage,
      downloadTenantAssetBuffer: async (blobUrl: string) => ({
        buffer: Buffer.from(`bytes-of:${blobUrl}`, "utf8"),
        mimeType: blobUrl.endsWith(".html") ? "text/html; charset=utf-8" : "image/png",
      }),
    };
  }
  return prevLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GET, HEAD } = require("../src/app/api/media/[id]/route") as {
  GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  HEAD: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
};

describe("Isolamento de mídia /api/media/[id] (Prompt 19)", () => {
  beforeEach(() => {
    process.env.APP_PANEL_HOST = "172.212.145.134";
    process.env.APP_BASE_URL = "http://172.212.145.134";
    process.env.LP_FALLBACK_ENABLED = "false";
    process.env.TRUSTED_PROXY = "0";
    currentSession = null;
  });

  it("permite GET e HEAD anônimos para imagem vinculada a LP publicada no domínio correto", async () => {
    const getRes = await GET(
      new Request("https://a.cliente1.com/api/media/img-lp-a", {
        headers: { host: "a.cliente1.com" },
      }),
      { params: Promise.resolve({ id: "img-lp-a" }) }
    );
    assert.equal(getRes.status, 200);
    assert.match(await getRes.text(), /hero\.png/);

    const headRes = await HEAD(
      new Request("https://a.cliente1.com/api/media/img-lp-a", {
        method: "HEAD",
        headers: { host: "a.cliente1.com" },
      }),
      { params: Promise.resolve({ id: "img-lp-a" }) }
    );
    assert.equal(headRes.status, 200);
    assert.equal(await headRes.text(), "");
    assert.ok(Number(headRes.headers.get("content-length")) > 0);
  });

  it("nega acesso anônimo a HTML publicado (lp_asset) e a logo/lp_asset não vinculados à LP do domínio", async () => {
    const htmlAssetRes = await GET(
      new Request("https://a.cliente1.com/api/media/html-lp-a", {
        headers: { host: "a.cliente1.com" },
      }),
      { params: Promise.resolve({ id: "html-lp-a" }) }
    );
    assert.equal(htmlAssetRes.status, 403);

    const logoRes = await GET(
      new Request("https://a.cliente1.com/api/media/logo-unlinked", {
        headers: { host: "a.cliente1.com" },
      }),
      { params: Promise.resolve({ id: "logo-unlinked" }) }
    );
    assert.equal(logoRes.status, 403);
  });

  it("nega tentativa cruzada entre domínios do mesmo tenant e entre tenants", async () => {
    // Mesmo tenant (tenant-1), mas domínio b.cliente1.com (LP pertence a dom-a)
    const crossDomain = await GET(
      new Request("https://b.cliente1.com/api/media/img-lp-a", {
        headers: { host: "b.cliente1.com" },
      }),
      { params: Promise.resolve({ id: "img-lp-a" }) }
    );
    assert.equal(crossDomain.status, 403);

    // Outro tenant (tenant-2) tentando acessar asset do tenant-1
    const crossTenant = await GET(
      new Request("https://c.cliente2.com/api/media/img-lp-a", {
        headers: { host: "c.cliente2.com" },
      }),
      { params: Promise.resolve({ id: "img-lp-a" }) }
    );
    assert.equal(crossTenant.status, 403);
  });

  it("nega referência privada no painel sem sessão e permite apenas ao tenant autenticado", async () => {
    const anonPanel = await GET(
      new Request("http://172.212.145.134/api/media/social-slide-1", {
        headers: { host: "172.212.145.134" },
      }),
      { params: Promise.resolve({ id: "social-slide-1" }) }
    );
    assert.equal(anonPanel.status, 401);

    // Usuário autenticado de outro tenant continua negado
    currentSession = { id: "u2", tenantId: "tenant-2", role: "EDITOR", isSuperAdmin: false };
    const otherTenantAuth = await GET(
      new Request("http://172.212.145.134/api/media/social-slide-1", {
        headers: { host: "172.212.145.134" },
      }),
      { params: Promise.resolve({ id: "social-slide-1" }) }
    );
    assert.equal(otherTenantAuth.status, 403);

    // Usuário autenticado do mesmo tenant tem acesso
    currentSession = { id: "u1", tenantId: "tenant-1", role: "EDITOR", isSuperAdmin: false };
    const sameTenantAuth = await GET(
      new Request("http://172.212.145.134/api/media/social-slide-1", {
        headers: { host: "172.212.145.134" },
      }),
      { params: Promise.resolve({ id: "social-slide-1" }) }
    );
    assert.equal(sameTenantAuth.status, 200);
  });

  it("permite URL assinada social válida e rejeita assinatura inválida ou snapshot HTML", async () => {
    signedTenantActive = true;
    const signedPath = signMediaAssetPath("/api/media/social-slide-1", "tenant-1", 3600);
    const validSigned = await GET(
      new Request(`https://stage.consulting${signedPath}`, {
        headers: { host: "stage.consulting" },
      }),
      { params: Promise.resolve({ id: "social-slide-1" }) }
    );
    assert.equal(validSigned.status, 200);

    const invalidSigned = await GET(
      new Request("https://stage.consulting/api/media/social-slide-1?exp=9999999999&sig=" + "a".repeat(64), {
        headers: { host: "stage.consulting" },
      }),
      { params: Promise.resolve({ id: "social-slide-1" }) }
    );
    assert.equal(invalidSigned.status, 403);

    const signedHtml = signMediaAssetPath("/api/media/html-lp-a", "tenant-1", 3600);
    const htmlSignedRes = await GET(
      new Request(`https://stage.consulting${signedHtml}`, {
        headers: { host: "stage.consulting" },
      }),
      { params: Promise.resolve({ id: "html-lp-a" }) }
    );
    assert.equal(htmlSignedRes.status, 403);
  });
  it("URL assinada não restaura acesso de tenant desativado", async () => {
    signedTenantActive = false;
    const signedPath = signMediaAssetPath("/api/media/social-slide-1", "tenant-1", 3600);
    try {
      const res = await GET(new Request(`https://stage.consulting${signedPath}`), { params: Promise.resolve({ id: "social-slide-1" }) });
      assert.equal(res.status, 403);
    } finally { signedTenantActive = true; }
  });
});
