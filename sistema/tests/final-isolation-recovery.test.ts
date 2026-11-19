import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { DnsStatus, LPStatus, SslStatus } from "@prisma/client";

type TenantState = { id: string; slug: string; name: string; isActive: boolean };
type DomainState = {
  id: string;
  tenantId: string;
  domain: string;
  isSubdomain: boolean;
  dnsProviderHint: string | null;
  verificationToken: string;
  cnameTarget: string;
  dnsStatus: DnsStatus;
  sslStatus: SslStatus;
  isDefault: boolean;
  homeLandingPageId: string | null;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  checkAttempts: number;
  consecutiveFailures: number;
  lastReasonCode: string | null;
  lastError: string | null;
  lockedUntil: string | null;
  lockedBy: string | null;
  createdAt: string;
};
type LpState = {
  id: string;
  tenantId: string;
  customDomainId: string | null;
  slug: string;
  title: string;
  status: LPStatus;
  publishedBlobUrl: string | null;
  publishedAssetIds: string[];
  seoMetadata: Record<string, unknown> | null;
  trackingConfig: Record<string, unknown> | null;
};
type AssetState = {
  id: string;
  tenantId: string;
  category: string;
  fileName: string;
  mimeType: string;
  blobUrl: string;
};
type LeadState = {
  id: string;
  tenantId: string;
  landingPageId: string;
  payload: Record<string, unknown>;
  utmData: Record<string, unknown>;
  emailDeliveryStatus: string;
};

type PersistedDb = {
  tenants: TenantState[];
  domains: DomainState[];
  lps: LpState[];
  assets: AssetState[];
  leads: LeadState[];
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-final-test-"));
const dbFile = path.join(tmpDir, "db-state.json");
const redisStore = new Map<string, string>();
let redisDown = false;
let currentSession: null = null;
let invalidatedHosts: string[] = [];

function writeInitialDb(): void {
  const initial: PersistedDb = {
    tenants: [
      { id: "t1", slug: "emp1", name: "Empresa 1", isActive: true },
      { id: "t2", slug: "emp2", name: "Empresa 2", isActive: true },
      { id: "t3", slug: "emp3", name: "Empresa 3 Inativa", isActive: false },
    ],
    domains: [
      {
        id: "dom-1a",
        tenantId: "t1",
        domain: "a.empresa1.test",
        isSubdomain: true,
        dnsProviderHint: "GoDaddy",
        verificationToken: "tok-1a",
        cnameTarget: "domains.stage.consult",
        dnsStatus: DnsStatus.VERIFIED,
        sslStatus: SslStatus.ACTIVE,
        isDefault: true,
        homeLandingPageId: "lp-1a",
        lastCheckedAt: new Date().toISOString(),
        nextCheckAt: null,
        checkAttempts: 0,
        consecutiveFailures: 0,
        lastReasonCode: null,
        lastError: null,
        lockedUntil: null,
        lockedBy: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: "dom-1b",
        tenantId: "t1",
        domain: "b.empresa1.test",
        isSubdomain: true,
        dnsProviderHint: "GoDaddy",
        verificationToken: "tok-1b",
        cnameTarget: "domains.stage.consult",
        dnsStatus: DnsStatus.PENDING,
        sslStatus: SslStatus.PENDING,
        isDefault: false,
        homeLandingPageId: null,
        lastCheckedAt: null,
        nextCheckAt: null,
        checkAttempts: 0,
        consecutiveFailures: 0,
        lastReasonCode: null,
        lastError: null,
        lockedUntil: null,
        lockedBy: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: "dom-2c",
        tenantId: "t2",
        domain: "c.empresa2.test",
        isSubdomain: true,
        dnsProviderHint: "Cloudflare",
        verificationToken: "tok-2c",
        cnameTarget: "domains.stage.consult",
        dnsStatus: DnsStatus.VERIFIED,
        sslStatus: SslStatus.ACTIVE,
        isDefault: true,
        homeLandingPageId: null,
        lastCheckedAt: new Date().toISOString(),
        nextCheckAt: null,
        checkAttempts: 0,
        consecutiveFailures: 0,
        lastReasonCode: null,
        lastError: null,
        lockedUntil: null,
        lockedBy: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: "dom-3d",
        tenantId: "t3",
        domain: "d.empresa3.test",
        isSubdomain: true,
        dnsProviderHint: "GoDaddy",
        verificationToken: "tok-3d",
        cnameTarget: "domains.stage.consult",
        dnsStatus: DnsStatus.VERIFIED,
        sslStatus: SslStatus.ACTIVE,
        isDefault: true,
        homeLandingPageId: null,
        lastCheckedAt: new Date().toISOString(),
        nextCheckAt: null,
        checkAttempts: 0,
        consecutiveFailures: 0,
        lastReasonCode: null,
        lastError: null,
        lockedUntil: null,
        lockedBy: null,
        createdAt: new Date().toISOString(),
      },
    ],
    lps: [
      {
        id: "lp-1a",
        tenantId: "t1",
        customDomainId: "dom-1a",
        slug: "promo-1a",
        title: "Promo 1A",
        status: LPStatus.PUBLISHED,
        publishedBlobUrl: "https://storage.blob.core.windows.net/assets/t1/lp_asset/2026-11/promo-1a.html",
        publishedAssetIds: ["img-1a"],
        seoMetadata: null,
        trackingConfig: null,
      },
      {
        id: "lp-1b",
        tenantId: "t1",
        customDomainId: "dom-1b",
        slug: "promo-1b",
        title: "Promo 1B",
        status: LPStatus.PUBLISHED,
        publishedBlobUrl: "https://storage.blob.core.windows.net/assets/t1/lp_asset/2026-11/promo-1b.html",
        publishedAssetIds: ["img-1b"],
        seoMetadata: null,
        trackingConfig: null,
      },
      {
        id: "lp-2c",
        tenantId: "t2",
        customDomainId: "dom-2c",
        slug: "promo-2c",
        title: "Promo 2C",
        status: LPStatus.PUBLISHED,
        publishedBlobUrl: "https://storage.blob.core.windows.net/assets/t2/lp_asset/2026-11/promo-2c.html",
        publishedAssetIds: ["img-2c"],
        seoMetadata: null,
        trackingConfig: null,
      },
    ],
    assets: [
      {
        id: "img-1a",
        tenantId: "t1",
        category: "lp_asset",
        fileName: "1a.png",
        mimeType: "image/png",
        blobUrl: "https://storage.blob.core.windows.net/assets/t1/lp_asset/2026-11/1a.png",
      },
      {
        id: "img-1b",
        tenantId: "t1",
        category: "lp_asset",
        fileName: "1b.png",
        mimeType: "image/png",
        blobUrl: "https://storage.blob.core.windows.net/assets/t1/lp_asset/2026-11/1b.png",
      },
      {
        id: "img-2c",
        tenantId: "t2",
        category: "lp_asset",
        fileName: "2c.png",
        mimeType: "image/png",
        blobUrl: "https://storage.blob.core.windows.net/assets/t2/lp_asset/2026-11/2c.png",
      },
    ],
    leads: [],
  };
  fs.writeFileSync(dbFile, JSON.stringify(initial, null, 2), "utf8");
}

function readDb(): PersistedDb {
  return JSON.parse(fs.readFileSync(dbFile, "utf8")) as PersistedDb;
}
function saveDb(db: PersistedDb): void {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), "utf8");
}

function hydrateDomain(d: DomainState, db: PersistedDb) {
  return {
    ...d,
    lastCheckedAt: d.lastCheckedAt ? new Date(d.lastCheckedAt) : null,
    nextCheckAt: d.nextCheckAt ? new Date(d.nextCheckAt) : null,
    lockedUntil: d.lockedUntil ? new Date(d.lockedUntil) : null,
    createdAt: new Date(d.createdAt),
    tenant: db.tenants.find((t) => t.id === d.tenantId)!,
  };
}

const mockPrisma: Record<string, unknown> = {
  customDomain: {
    findUnique: async (args: { where: { domain?: string; id?: string } }) => {
      const db = readDb();
      const d = db.domains.find(
        (x) => (args.where.domain ? x.domain === args.where.domain : x.id === args.where.id)
      );
      return d ? hydrateDomain(d, db) : null;
    },
    findFirst: async (args: {
      where: {
        id?: string;
        tenantId?: string;
        homeLandingPageId?: { not: null };
      };
      select?: { homeLandingPage?: boolean };
    }) => {
      const db = readDb();
      const d = db.domains.find(
        (x) =>
          (args.where.id === undefined || x.id === args.where.id) &&
          (args.where.tenantId === undefined || x.tenantId === args.where.tenantId) &&
          (!args.where.homeLandingPageId || x.homeLandingPageId !== null)
      );
      if (!d) return null;
      if (args.select?.homeLandingPage) {
        return {
          ...hydrateDomain(d, db),
          homeLandingPage: db.lps.find((l) => l.id === d.homeLandingPageId) ?? null,
        };
      }
      return hydrateDomain(d, db);
    },
    updateMany: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const db = readDb();
      const idx = db.domains.findIndex((x) => x.id === args.where.id);
      if (idx === -1) return { count: 0 };
      Object.assign(db.domains[idx], args.data);
      saveDb(db);
      return { count: 1 };
    },
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      const db = readDb();
      const idx = db.domains.findIndex((x) => x.id === args.where.id);
      if (idx === -1) throw new Error("Domain not found");
      for (const [k, v] of Object.entries(args.data)) {
        (db.domains[idx] as Record<string, unknown>)[k] = v instanceof Date ? v.toISOString() : v;
      }
      saveDb(db);
      return hydrateDomain(db.domains[idx], db);
    },
  },
  landingPage: {
    findFirst: async (args: {
      where?: {
        id?: string;
        slug?: string;
        tenantId?: string;
        customDomainId?: string | null;
        status?: LPStatus;
        publishedAssetIds?: { has: string };
      };
    }) => {
      const db = readDb();
      const w = args.where ?? {};
      const lp = db.lps.find(
        (l) =>
          (w.id === undefined || l.id === w.id) &&
          (w.slug === undefined || l.slug === w.slug) &&
          (w.tenantId === undefined || l.tenantId === w.tenantId) &&
          (w.customDomainId === undefined || l.customDomainId === w.customDomainId) &&
          (w.status === undefined || l.status === w.status) &&
          (!w.publishedAssetIds?.has || l.publishedAssetIds.includes(w.publishedAssetIds.has))
      );
      if (!lp) return null;
      return { ...lp, tenant: db.tenants.find((t) => t.id === lp.tenantId)! };
    },
    update: async () => ({ id: "ok" }),
  },
  mediaAsset: {
    findUnique: async (args: { where: { id: string } }) =>
      readDb().assets.find((a) => a.id === args.where.id) ?? null,
  },
  lpLead: {
    create: async (args: { data: Record<string, unknown> }) => {
      const db = readDb();
      const row: LeadState = {
        id: `lead-${db.leads.length + 1}`,
        tenantId: args.data.tenantId as string,
        landingPageId: args.data.landingPageId as string,
        payload: args.data.payload as Record<string, unknown>,
        utmData: args.data.utmData as Record<string, unknown>,
        emailDeliveryStatus: args.data.emailDeliveryStatus as string,
      };
      db.leads.push(row);
      saveDb(db);
      return { id: row.id };
    },
  },
};

const originalLoad = (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load;

(Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "@/lib/auth") {
    return { usuarioAtual: async () => currentSession };
  }
  if (request === "@/lib/prisma" || request === "./prisma") {
    return { __esModule: true, default: mockPrisma, prisma: mockPrisma };
  }
  if (request === "@/lib/email-service") {
    return { enqueueLeadNotification: async () => {} };
  }
  if (request === "@/lib/brand-assets") {
    return { resolveLpHtmlAssets: async (html: string) => html };
  }
  if (request === "@/lib/storage") {
    class MockErr extends Error {
      statusCode = 503;
      code = "STORAGE_ERR";
    }
    return {
      StorageConfigError: MockErr,
      StorageOperationError: MockErr,
      isHtmlLpSnapshotAsset: (a: { category?: string; mimeType?: string }) =>
        a.category === "lp_asset" && Boolean(a.mimeType?.startsWith("text/html")),
      verifySignedMediaToken: () => false,
      downloadTenantAssetBuffer: async (blobUrl: string) => ({
        buffer: Buffer.from(`<html><head></head><body><h1>${blobUrl}</h1></body></html>`, "utf8"),
        mimeType: blobUrl.endsWith(".html") ? "text/html" : "image/png",
      }),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function bootFreshServiceModules() {
  for (const rel of [
    "../src/lib/redis",
    "../src/lib/domains",
    "../src/proxy",
    "../src/app/lp-public/[host]/[slug]/route",
    "../src/app/api/media/[id]/route",
    "../src/app/api/public/leads/route",
  ]) {
    delete require.cache[require.resolve(rel)];
  }
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.redisClient;
  delete g.redisUnavailable;
  delete g.memoryCache;

  // Injeta cliente Redis compartilhado em memória
  g.redisClient = {
    get: async (k: string) => { if (redisDown) throw new Error("REDIS_DOWN"); return redisStore.get(k) ?? null; },
    set: async (k: string, v: string) => {
      if (redisDown) throw new Error("REDIS_DOWN");
      redisStore.set(k, v);
      return "OK";
    },
    del: async (k: string) => {
      if (redisDown) throw new Error("REDIS_DOWN");
      redisStore.delete(k);
      invalidatedHosts.push(k);
      return 1;
    },
  };

  return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    redis: require("../src/lib/redis") as typeof import("../src/lib/redis"),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    domains: require("../src/lib/domains") as typeof import("../src/lib/domains"),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    proxyMod: require("../src/proxy") as { proxy: (req: NextRequest) => Promise<Response> },
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    lpPublic: require("../src/app/lp-public/[host]/[slug]/route") as {
      GET: (req: Request, ctx: { params: Promise<{ host: string; slug: string }> }) => Promise<Response>;
    },
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    media: require("../src/app/api/media/[id]/route") as {
      GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
    },
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    leads: require("../src/app/api/public/leads/route") as {
      POST: (req: Request) => Promise<Response>;
    },
  };
}

describe("Testes finais de isolamento, recuperação e reinício (Prompt 30)", () => {
  beforeEach(() => {
    process.env.APP_PANEL_HOST = "172.212.145.134";
    process.env.APP_BASE_URL = "http://172.212.145.134";
    process.env.LP_FALLBACK_ENABLED = "false";
    process.env.DOMAIN_ROUTING_MODE = "direct-ip";
    process.env.DOMAIN_TARGET_IPV4 = "172.212.145.134";
    process.env.DOMAIN_TLS_PROVIDER = "caddy";
    process.env.TRUSTED_PROXY = "0";
    process.env.JWT_SECRET = "test-secret-for-final-isolation-suite-32chars!!";
    redisStore.clear();
    redisDown = false;
    invalidatedHosts = [];
    currentSession = null;
    writeInitialDb();
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("Redis recuperado com chave positiva obsoleta não restaura LP ou mídia revogada", async () => {
    for (const revoke of ["tenant", "dns", "remove", "association"]) {
      writeInitialDb();
      const svc = bootFreshServiceModules();
      assert.ok(await svc.redis.getDomainMapping("a.empresa1.test"));
      const stale = redisStore.get("domain_map:a.empresa1.test")!;
      const db = readDb();
      if (revoke === "tenant") db.tenants[0].isActive = false;
      if (revoke === "dns") db.domains[0].dnsStatus = DnsStatus.FAILED;
      if (revoke === "remove") db.domains.splice(0, 1);
      if (revoke === "association") db.lps[0].customDomainId = "dom-1b";
      saveDb(db);
      redisDown = true;
      await svc.redis.invalidateDomainMapping("a.empresa1.test");
      redisDown = false;
      // Inclui preenchimento atrasado concorrente depois da invalidação.
      redisStore.set("domain_map:a.empresa1.test", stale);
      const pRes = await svc.proxyMod.proxy(new NextRequest("https://a.empresa1.test/promo-1a", { headers: { host: "a.empresa1.test" } }));
      const rewrite = pRes.headers.get("x-middleware-rewrite");
      let response: Response = pRes;
      if (rewrite) {
        const parts = new URL(rewrite).pathname.replace(/^\/lp-public\//, "").split("/");
        response = await svc.lpPublic.GET(new Request(rewrite, { headers: pRes.headers }), { params: Promise.resolve({ host: parts[0], slug: parts[1] }) });
      }
      assert.notEqual(response.status, 200, revoke);
      redisStore.set("domain_map:a.empresa1.test", stale);
      const media = await svc.media.GET(new Request("https://a.empresa1.test/api/media/img-1a", { headers: { host: "a.empresa1.test" } }), { params: Promise.resolve({ id: "img-1a" }) });
      assert.notEqual(media.status, 200, revoke);
    }
  });

  it("recupera de propagação DNS lenta e invalida cache negativo entre módulos", async () => {
    const svc = bootFreshServiceModules();
    // 1. Consulta inicial gera cache negativo em b.empresa1.test (PENDING)
    assert.equal(await svc.redis.getDomainMapping("b.empresa1.test"), null);
    assert.equal(redisStore.get("domain_map:b.empresa1.test"), "__NULL__");

    // 2. Primeira verificação DNS falha (propagação lenta -> ENOTFOUND)
    const errNotFound = Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    const failRes = await svc.domains.verifyCustomDomain("t1", "dom-1b", {
      trigger: "worker",
      dnsResolver: {
        resolve4: async () => { throw errNotFound; },
        resolve6: async () => { throw errNotFound; },
        resolveTxt: async () => { throw errNotFound; },
      },
    });
    assert.equal(failRes.verified, false);
    assert.equal(failRes.domain.dnsStatus, DnsStatus.FAILED);
    assert.ok(failRes.domain.nextCheckAt);

    // 3. Após propagação real do A + TXT, segunda verificação recupera -> VERIFIED e invalida cache negativo
    const okRes = await svc.domains.verifyCustomDomain("t1", "dom-1b", {
      trigger: "worker",
      dnsResolver: {
        resolve4: async () => ["172.212.145.134"],
        resolve6: async () => { throw Object.assign(new Error("ENODATA"), { code: "ENODATA" }); },
        resolveTxt: async () => [["tok-1b"]],
      },
    });
    assert.equal(okRes.verified, true);
    assert.equal(okRes.domain.dnsStatus, DnsStatus.VERIFIED);
    assert.equal(okRes.domain.sslStatus, SslStatus.PROVISIONING);
    assert.equal(okRes.domain.consecutiveFailures, 0);

    const mapped = await svc.redis.getDomainMapping("b.empresa1.test");
    assert.ok(mapped);
    assert.equal(mapped.customDomainId, "dom-1b");
  });

  it("isola LP, raiz, mídia e leads entre duas empresas, dois domínios do mesmo tenant e tenant inativo", async () => {
    // Ativa dom-1b para testar dois domínios ativos do mesmo tenant t1
    const db = readDb();
    db.domains[1].dnsStatus = DnsStatus.VERIFIED;
    db.domains[1].sslStatus = SslStatus.ACTIVE;
    saveDb(db);

    const svc = bootFreshServiceModules();

    // Helper de abertura pública via proxy -> lp-public
    const open = async (host: string, pathname: string) => {
      const pRes = await svc.proxyMod.proxy(
        new NextRequest(`https://${host}${pathname}`, { headers: { host } })
      );
      const rewrite = pRes.headers.get("x-middleware-rewrite");
      if (!rewrite) return pRes;
      const parsed = new URL(rewrite);
      const parts = parsed.pathname.replace(/^\/lp-public\//, "").split("/");
      const headers = new Headers();
      headers.set("host", host);
      for (const [k, v] of pRes.headers.entries()) {
        if (k.startsWith("x-middleware-request-")) {
          headers.set(k.slice("x-middleware-request-".length), v);
        }
      }
      return svc.lpPublic.GET(new Request(parsed.toString(), { headers }), {
        params: Promise.resolve({ host: parts[0] ?? "", slug: parts[1] ?? "" }),
      });
    };

    // LP + raiz corretas vs domínio errado do mesmo tenant vs outro tenant vs tenant inativo
    assert.equal((await open("a.empresa1.test", "/promo-1a")).status, 200);
    assert.equal((await open("a.empresa1.test", "/")).status, 200);
    assert.equal((await open("b.empresa1.test", "/promo-1a")).status, 404);
    assert.equal((await open("b.empresa1.test", "/")).status, 404);
    assert.equal((await open("c.empresa2.test", "/promo-1a")).status, 404);
    assert.equal((await open("d.empresa3.test", "/promo-1a")).status, 404);

    // Caminho /lp-public manipulado bloqueado
    assert.equal((await open("a.empresa1.test", "/lp-public/c.empresa2.test/promo-2c")).status, 404);

    // Mídia: img-1a autorizada apenas em a.empresa1.test, negada em b.empresa1.test e c.empresa2.test
    assert.equal(
      (await svc.media.GET(new Request("https://a.empresa1.test/api/media/img-1a", { headers: { host: "a.empresa1.test" } }), { params: Promise.resolve({ id: "img-1a" }) })).status,
      200
    );
    assert.equal(
      (await svc.media.GET(new Request("https://b.empresa1.test/api/media/img-1a", { headers: { host: "b.empresa1.test" } }), { params: Promise.resolve({ id: "img-1a" }) })).status,
      403
    );
    assert.equal(
      (await svc.media.GET(new Request("https://c.empresa2.test/api/media/img-1a", { headers: { host: "c.empresa2.test" } }), { params: Promise.resolve({ id: "img-1a" }) })).status,
      403
    );

    // Leads: body.host forjado e domínio errado rejeitados sem gravação
    const badLead = await svc.leads.POST(
      new Request("https://a.empresa1.test/api/public/leads", {
        method: "POST",
        headers: { host: "a.empresa1.test", "content-type": "application/json" },
        body: JSON.stringify({
          host: "c.empresa2.test",
          landingPageId: "lp-2c",
          email: "spoof@exemplo.invalid",
        }),
      })
    );
    assert.equal(badLead.status, 404);
    assert.equal(readDb().leads.length, 0);
  });

  it("preserva domínios, LPs, raiz e leads após reinício planejado dos serviços", async () => {
    const svc1 = bootFreshServiceModules();
    const leadOk = await svc1.leads.POST(
      new Request("https://a.empresa1.test/api/public/leads", {
        method: "POST",
        headers: { host: "a.empresa1.test", "content-type": "application/json" },
        body: JSON.stringify({ landingPageId: "lp-1a", name: "Ana", email: "ana@exemplo.invalid" }),
      })
    );
    assert.equal(leadOk.status, 200);

    // Simula reinício planejado dos processos (limpa require.cache + globalThis + memória Redis local)
    const svc2 = bootFreshServiceModules();
    const pRes = await svc2.proxyMod.proxy(
      new NextRequest("https://a.empresa1.test/", { headers: { host: "a.empresa1.test" } })
    );
    const rewrite = pRes.headers.get("x-middleware-rewrite");
    assert.ok(rewrite);
    const parsed = new URL(rewrite);
    const parts = parsed.pathname.replace(/^\/lp-public\//, "").split("/");
    const headers = new Headers();
    headers.set("host", "a.empresa1.test");
    for (const [k, v] of pRes.headers.entries()) {
      if (k.startsWith("x-middleware-request-")) {
        headers.set(k.slice("x-middleware-request-".length), v);
      }
    }
    const rootAfterRestart = await svc2.lpPublic.GET(new Request(parsed.toString(), { headers }), {
      params: Promise.resolve({ host: parts[0] ?? "", slug: parts[1] ?? "" }),
    });
    assert.equal(rootAfterRestart.status, 200);
    assert.equal(readDb().leads.length, 1);

    // Tenant inativo continua bloqueado após reinício
    assert.equal(await svc2.redis.getDomainMapping("d.empresa3.test"), null);
  });
});
