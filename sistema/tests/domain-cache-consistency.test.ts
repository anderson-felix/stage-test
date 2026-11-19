import assert from "node:assert/strict";
import Module from "node:module";
import { beforeEach, describe, it } from "node:test";
import { DnsStatus } from "@prisma/client";

type DbDomain = {
  id: string;
  domain: string;
  dnsStatus: DnsStatus;
  tenant: { id: string; slug: string; isActive: boolean };
};

let dbDomains: DbDomain[] = [];
let sharedRedisStore = new Map<string, string>();
let redisDown = false;
let dbDown = false;

const mockSharedRedis = {
  get: async (key: string) => {
    if (redisDown) throw new Error("ECONNREFUSED");
    return sharedRedisStore.get(key) ?? null;
  },
  set: async (key: string, val: string) => {
    if (redisDown) throw new Error("ECONNREFUSED");
    sharedRedisStore.set(key, val);
    return "OK";
  },
  del: async (key: string) => {
    if (redisDown) throw new Error("ECONNREFUSED");
    sharedRedisStore.delete(key);
    return 1;
  },
};

const mockPrisma = {
  customDomain: {
    findUnique: async (args: { where: { domain: string } }) =>
      { if (dbDown) throw new Error("DB_UNAVAILABLE"); return dbDomains.find((d) => d.domain === args.where.domain) ?? null; },
    findMany: async (args: { where: { tenantId: string } }) =>
      dbDomains
        .filter((d) => d.tenant.id === args.where.tenantId)
        .map((d) => ({ domain: d.domain })),
  },
  tenant: {
    findUnique: async (args: { where: { id: string } }) => {
      const d = dbDomains.find((x) => x.tenant.id === args.where.id);
      return d ? { id: d.tenant.id, name: "Cliente", slug: d.tenant.slug, isActive: d.tenant.isActive } : null;
    },
    update: async (args: { where: { id: string }; data: { isActive?: boolean } }) => {
      for (const d of dbDomains) {
        if (d.tenant.id === args.where.id && typeof args.data.isActive === "boolean") {
          d.tenant.isActive = args.data.isActive;
        }
      }
      return { id: args.where.id, isActive: args.data.isActive ?? true };
    },
  },
};

const originalLoad = (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load;

(Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "@/lib/prisma" || request === "./prisma") {
    return { __esModule: true, default: mockPrisma, prisma: mockPrisma };
  }
  if (request === "@/lib/auth") {
    return {
      exigirSuperAdmin: async () => ({ id: "sa-1", isSuperAdmin: true, tenantId: "t1", role: "OWNER" }),
    };
  }
  if (request === "@/lib/usuarios") {
    return { hashSenha: async (s: string) => s };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// Simula dois processos independentes (`web` e `worker`) carregando `@/lib/redis`
// com estado global separado, compartilhando apenas o mesmo Redis externo (`mockSharedRedis`).
function loadRedisModuleForProcess() {
  const resolved = require.resolve("../src/lib/redis");
  delete require.cache[resolved];
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.redisClient;
  delete g.redisUnavailable;
  delete g.memoryCache;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("../src/lib/redis") as typeof import("../src/lib/redis");
  // Injeta o cliente Redis compartilhado no globalThis do "processo"
  const globalForRedis = globalThis as unknown as { redisClient?: unknown };
  globalForRedis.redisClient = mockSharedRedis;
  return mod;
}

describe("Consistência de cache de domínio em dois processos (Prompt 20)", () => {
  beforeEach(() => {
    process.env.APP_PANEL_HOST = "172.212.145.134";
    process.env.APP_BASE_URL = "http://172.212.145.134";
    process.env.LP_FALLBACK_ENABLED = "false";
    sharedRedisStore = new Map();
    redisDown = false; dbDown = false;
    dbDomains = [
      {
        id: "dom-1",
        domain: "lp.cliente1.com",
        dnsStatus: DnsStatus.PENDING,
        tenant: { id: "t1", slug: "cliente1", isActive: true },
      },
    ];
  });

  it("domínio recém-verificado no worker após cache negativo no web fica disponível imediatamente", async () => {
    const webRedis = loadRedisModuleForProcess();
    const first = await webRedis.getDomainMapping("lp.cliente1.com");
    assert.equal(first, null);
    assert.equal(sharedRedisStore.get("domain_map:lp.cliente1.com"), "__NULL__");

    // Worker verifica o domínio e invalida o cache compartilhado
    const workerRedis = loadRedisModuleForProcess();
    dbDomains[0].dnsStatus = DnsStatus.VERIFIED;
    await workerRedis.invalidateDomainMapping("lp.cliente1.com");

    // Web (outro processo) vê o domínio verificado imediatamente
    const second = await webRedis.getDomainMapping("lp.cliente1.com");
    assert.ok(second);
    assert.equal(second.tenantId, "t1");
    assert.equal(second.customDomainId, "dom-1");
  });

  it("remoção/revogação de domínio com cache positivo no web é refletida após invalidação do worker", async () => {
    dbDomains[0].dnsStatus = DnsStatus.VERIFIED;
    const webRedis = loadRedisModuleForProcess();
    const cached = await webRedis.getDomainMapping("lp.cliente1.com");
    assert.ok(cached);

    // Worker remove/revoga o domínio e invalida o cache
    const workerRedis = loadRedisModuleForProcess();
    dbDomains = [];
    await workerRedis.invalidateDomainMapping("lp.cliente1.com");

    const afterRevoke = await webRedis.getDomainMapping("lp.cliente1.com");
    assert.equal(afterRevoke, null);
  });

  it("desativação de tenant via PATCH /api/admin/tenants invalida domínios e bloqueia entrega", async () => {
    dbDomains[0].dnsStatus = DnsStatus.VERIFIED;
    const webRedis = loadRedisModuleForProcess();
    const before = await webRedis.getDomainMapping("lp.cliente1.com");
    assert.ok(before);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PATCH } = require("../src/app/api/admin/tenants/route") as {
      PATCH: (req: Request) => Promise<Response>;
    };
    const res = await PATCH(
      new Request("http://172.212.145.134/api/admin/tenants", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: "t1", isActive: false }),
      })
    );
    assert.equal(res.status, 200);

    const after = await webRedis.getDomainMapping("lp.cliente1.com");
    assert.equal(after, null);
  });

  it("com Redis indisponível, consulta PostgreSQL diretamente sem servir autorização obsoleta em memória", async () => {
    dbDomains[0].dnsStatus = DnsStatus.VERIFIED;
    const webRedis = loadRedisModuleForProcess();
    assert.ok(await webRedis.getDomainMapping("lp.cliente1.com"));

    // Simula revogação no banco + queda do Redis simultânea
    dbDomains[0].dnsStatus = DnsStatus.FAILED;
    redisDown = true;

    const result = await webRedis.getDomainMapping("lp.cliente1.com");
    assert.equal(result, null);
  });
});


it("cache positivo não autoriza quando PostgreSQL está indisponível", async () => {
  dbDown = false; redisDown = false;
  dbDomains[0].dnsStatus = DnsStatus.VERIFIED;
  const web = loadRedisModuleForProcess();
  assert.ok(await web.getDomainMapping("lp.cliente1.com"));
  dbDown = true;
  await assert.rejects(web.getDomainMapping("lp.cliente1.com"), /DB_UNAVAILABLE/);
  dbDown = false;
});
