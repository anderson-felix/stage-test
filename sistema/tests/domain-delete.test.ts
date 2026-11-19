import assert from "node:assert/strict";
import Module from "node:module";
import { beforeEach, describe, it } from "node:test";
import { DnsStatus, LPStatus, SslStatus } from "@prisma/client";

type DomainRecord = {
  id: string;
  tenantId: string;
  domain: string;
  dnsStatus: DnsStatus;
  sslStatus: SslStatus;
  homeLandingPageId: string | null;
  lastCheckedAt: Date | null;
  lastReasonCode: string | null;
  consecutiveFailures: number;
  tenant?: { id: string; isActive: boolean };
};

type LpRecord = {
  id: string;
  tenantId: string;
  customDomainId: string | null;
  slug: string;
  status: LPStatus;
};

let adminSession: { id: string; tenantId: string; role: string; isSuperAdmin: boolean } | Response;
let domains: DomainRecord[];
let lps: LpRecord[];
let invalidatedHosts: string[];
let txThrowError: Error | null;
let onInsideDeleteTx: (() => void) | null;

function resetState(): void {
  adminSession = { id: "admin-1", tenantId: "tenant-1", role: "ADMIN", isSuperAdmin: false };
  domains = [
    {
      id: "dom-1",
      tenantId: "tenant-1",
      domain: "lp.cliente1.com",
      dnsStatus: DnsStatus.VERIFIED,
      sslStatus: SslStatus.ACTIVE,
      homeLandingPageId: "lp-pub",
      lastCheckedAt: new Date(),
      lastReasonCode: null,
      consecutiveFailures: 0,
      tenant: { id: "tenant-1", isActive: true },
    },
    {
      id: "dom-2",
      tenantId: "tenant-2",
      domain: "lp.cliente2.com",
      dnsStatus: DnsStatus.VERIFIED,
      sslStatus: SslStatus.ACTIVE,
      homeLandingPageId: null,
      lastCheckedAt: new Date(),
      lastReasonCode: null,
      consecutiveFailures: 0,
      tenant: { id: "tenant-2", isActive: true },
    },
  ];
  lps = [
    {
      id: "lp-pub",
      tenantId: "tenant-1",
      customDomainId: "dom-1",
      slug: "oferta-ativa",
      status: LPStatus.PUBLISHED,
    },
    {
      id: "lp-draft",
      tenantId: "tenant-1",
      customDomainId: "dom-1",
      slug: "rascunho",
      status: LPStatus.DRAFT,
    },
  ];
  invalidatedHosts = [];
  txThrowError = null;
  onInsideDeleteTx = null;
}

const mockPrisma: {
  customDomain: {
    findFirst: (args: { where: { id?: string; tenantId?: string } }) => Promise<DomainRecord | null>;
    findUnique: (args: { where: { domain: string } }) => Promise<DomainRecord | null>;
    update: (args: { where: { id: string }; data: { homeLandingPageId?: string | null } }) => Promise<DomainRecord>;
    deleteMany: (args: { where: { id: string; tenantId: string } }) => Promise<{ count: number }>;
  };
  landingPage: {
    findMany: (args: { where: { tenantId: string; customDomainId: string; status: LPStatus } }) => Promise<LpRecord[]>;
    updateMany: (args: {
      where: { tenantId: string; customDomainId: string; status?: { not: LPStatus } };
      data: { customDomainId: null };
    }) => Promise<{ count: number }>;
  };
  $transaction: <T>(fn: (tx: typeof mockPrisma) => Promise<T>) => Promise<T>;
} = {
  customDomain: {
    findFirst: async (args: { where: { id?: string; tenantId?: string } }) =>
      domains.find(
        (d) =>
          (args.where.id === undefined || d.id === args.where.id) &&
          (args.where.tenantId === undefined || d.tenantId === args.where.tenantId)
      ) ?? null,
    findUnique: async (args: { where: { domain: string } }) =>
      domains.find((d) => d.domain === args.where.domain) ?? null,
    update: async (args: { where: { id: string }; data: { homeLandingPageId?: string | null } }) => {
      const d = domains.find((x) => x.id === args.where.id);
      if (!d) throw new Error("Domain not found");
      if (args.data.homeLandingPageId !== undefined) d.homeLandingPageId = args.data.homeLandingPageId;
      return d;
    },
    deleteMany: async (args: { where: { id: string; tenantId: string } }) => {
      const before = domains.length;
      domains = domains.filter((d) => !(d.id === args.where.id && d.tenantId === args.where.tenantId));
      return { count: before - domains.length };
    },
  },
  landingPage: {
    findMany: async (args: { where: { tenantId: string; customDomainId: string; status: LPStatus } }) =>
      lps.filter(
        (l) =>
          l.tenantId === args.where.tenantId &&
          l.customDomainId === args.where.customDomainId &&
          l.status === args.where.status
      ),
    updateMany: async (args: {
      where: { tenantId: string; customDomainId: string; status?: { not: LPStatus } };
      data: { customDomainId: null };
    }) => {
      let count = 0;
      for (const l of lps) {
        const statusOk = args.where.status?.not === undefined || l.status !== args.where.status.not;
        if (l.tenantId === args.where.tenantId && l.customDomainId === args.where.customDomainId && statusOk) {
          l.customDomainId = null;
          count++;
        }
      }
      return { count };
    },
  },
  $transaction: async <T>(fn: (tx: typeof mockPrisma) => Promise<T>): Promise<T> => {
    if (txThrowError) throw txThrowError;
    onInsideDeleteTx?.();
    return fn(mockPrisma);
  },
};

const originalLoad = (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load;

(Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "@/lib/auth") {
    return {
      exigirSessao: async () => adminSession,
      exigirEditor: async () => adminSession,
      exigirAdmin: async () => adminSession,
    };
  }
  if (request === "@/lib/prisma" || request === "./prisma") {
    return { __esModule: true, default: mockPrisma, prisma: mockPrisma };
  }
  if (request === "@/lib/redis" || request === "./redis") {
    return {
      normalizeHostname: (h: string) => h.trim().toLowerCase(),
      checkRateLimit: async () => ({ allowed: true, remaining: 5, retryAfterSeconds: 0 }),
      invalidateDomainMapping: async (host: string) => {
        invalidatedHosts.push(host);
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DELETE } = require("../src/app/api/domains/route") as {
  DELETE: (req: Request) => Promise<Response>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { checkCaddyOnDemandTlsAllow } = require("../src/lib/domains") as {
  checkCaddyOnDemandTlsAllow: (domain: string) => Promise<{ allowed: boolean; statusCode: number; reason: string }>;
};

describe("Exclusão segura de CustomDomain (Prompt 21)", () => {
  beforeEach(() => {
    process.env.APP_PANEL_HOST = "172.212.145.134";
    process.env.APP_BASE_URL = "http://172.212.145.134";
    process.env.LP_FALLBACK_ENABLED = "false";
    resetState();
  });

  it("bloqueia exclusão (409) enquanto houver LP publicada vinculada e preserva domínio e LP", async () => {
    const res = await DELETE(
      new Request("http://172.212.145.134/api/domains?id=dom-1", { method: "DELETE" })
    );
    assert.equal(res.status, 409);
    const data = await res.json();
    assert.match(data.error, /publicada/i);
    assert.match(data.error, /oferta-ativa/);
    assert.equal(domains.length, 2);
    assert.equal(lps[0].customDomainId, "dom-1");
    assert.equal(invalidatedHosts.length, 0);
  });

  it("permite exclusão após despublicar, limpa rascunhos, invalida cache e bloqueia ask do Caddy", async () => {
    lps[0].status = LPStatus.DRAFT;

    const beforeAsk = await checkCaddyOnDemandTlsAllow("lp.cliente1.com");
    assert.equal(beforeAsk.allowed, true);

    const res = await DELETE(
      new Request("http://172.212.145.134/api/domains?id=dom-1", { method: "DELETE" })
    );
    assert.equal(res.status, 200);
    assert.equal(domains.some((d) => d.id === "dom-1"), false);
    assert.equal(lps[0].customDomainId, null);
    assert.equal(lps[1].customDomainId, null);
    assert.deepEqual(invalidatedHosts, ["lp.cliente1.com"]);

    const afterAsk = await checkCaddyOnDemandTlsAllow("lp.cliente1.com");
    assert.equal(afterAsk.allowed, false);
    assert.equal(afterAsk.statusCode, 404);
    assert.equal(afterAsk.reason, "domain_not_found");
  });

  it("nega exclusão de domínio pertencente a outro tenant", async () => {
    const res = await DELETE(
      new Request("http://172.212.145.134/api/domains?id=dom-2", { method: "DELETE" })
    );
    assert.equal(res.status, 404);
    assert.equal(domains.some((d) => d.id === "dom-2"), true);
    assert.equal(invalidatedHosts.length, 0);
  });

  it("impede exclusão sob concorrência quando publicação ocorre antes da checagem transacional ou gera P2034", async () => {
    // Cenário 1: no início havia apenas DRAFT, mas publicação concorrente comita antes dentro da transação
    lps[0].status = LPStatus.DRAFT;
    onInsideDeleteTx = () => {
      lps[0].status = LPStatus.PUBLISHED;
    };
    const resRace = await DELETE(
      new Request("http://172.212.145.134/api/domains?id=dom-1", { method: "DELETE" })
    );
    assert.equal(resRace.status, 409);
    assert.equal(domains.some((d) => d.id === "dom-1"), true);

    // Cenário 2: conflito de serialização P2034
    onInsideDeleteTx = null;
    const err = new Error("Serialization failure") as Error & { code?: string };
    err.code = "P2034";
    txThrowError = err;
    const resP2034 = await DELETE(
      new Request("http://172.212.145.134/api/domains?id=dom-1", { method: "DELETE" })
    );
    assert.equal(resP2034.status, 409);
    assert.equal(domains.some((d) => d.id === "dom-1"), true);
  });
});
