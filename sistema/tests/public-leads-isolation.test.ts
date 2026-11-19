import assert from "node:assert/strict";
import Module from "node:module";
import { beforeEach, describe, it } from "node:test";
import { LPStatus } from "@prisma/client";

type DomainMap = {
  tenantId: string;
  tenantSlug: string;
  customDomainId: string | null;
  isFallback: boolean;
};

type LpFixture = {
  id: string;
  tenantId: string;
  customDomainId: string | null;
  slug: string;
  status: LPStatus;
  tenant: { id: string; isActive: boolean };
};

const DOMAINS: Record<string, DomainMap | null> = {
  "a.cliente1.com": { tenantId: "tenant-1", tenantSlug: "cliente1", customDomainId: "dom-a", isFallback: false },
  "b.cliente1.com": { tenantId: "tenant-1", tenantSlug: "cliente1", customDomainId: "dom-b", isFallback: false },
  "c.cliente2.com": { tenantId: "tenant-2", tenantSlug: "cliente2", customDomainId: "dom-c", isFallback: false },
  "desconhecido.com": null,
};

const LPS: LpFixture[] = [
  {
    id: "lp-a",
    tenantId: "tenant-1",
    customDomainId: "dom-a",
    slug: "oferta-a",
    status: LPStatus.PUBLISHED,
    tenant: { id: "tenant-1", isActive: true },
  },
  {
    id: "lp-b",
    tenantId: "tenant-1",
    customDomainId: "dom-b",
    slug: "oferta-b",
    status: LPStatus.PUBLISHED,
    tenant: { id: "tenant-1", isActive: true },
  },
  {
    id: "lp-c",
    tenantId: "tenant-2",
    customDomainId: "dom-c",
    slug: "oferta-c",
    status: LPStatus.PUBLISHED,
    tenant: { id: "tenant-2", isActive: true },
  },
];

let createdLeads: Array<Record<string, unknown>> = [];
let enqueuedLeadIds: string[] = [];
let rateAllowed = true;
let rateKeys: string[] = [];

const mockPrisma: {
  landingPage: {
    findFirst: (args: {
      where?: {
        id?: string;
        slug?: string;
        tenantId?: string;
        customDomainId?: string | null;
        status?: LPStatus;
      };
    }) => Promise<LpFixture | null>;
  };
  lpLead: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
  };
} = {
  landingPage: {
    findFirst: async (args) => {
      const w = args?.where ?? {};
      return (
        LPS.find(
          (l) =>
            (w.id === undefined || l.id === w.id) &&
            (w.slug === undefined || l.slug === w.slug) &&
            (w.tenantId === undefined || l.tenantId === w.tenantId) &&
            (w.customDomainId === undefined || l.customDomainId === w.customDomainId) &&
            (w.status === undefined || l.status === w.status)
        ) ?? null
      );
    },
  },
  lpLead: {
    create: async (args) => {
      createdLeads.push(args.data);
      return { id: `lead-${createdLeads.length}` };
    },
  },
};

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
      normalizeHostname: (h: string) => h.trim().toLowerCase(),
      checkRateLimit: async (key: string) => { rateKeys.push(key); return { allowed: rateAllowed, remaining: rateAllowed ? 14 : 0, retryAfterSeconds: 60 }; },
      getDomainMapping: async (host: string) => DOMAINS[host] ?? null,
    };
  }
  if (request === "@/lib/email-service") {
    return {
      enqueueLeadNotification: async (leadId: string) => {
        enqueuedLeadIds.push(leadId);
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = require("../src/app/api/public/leads/route") as {
  POST: (req: Request) => Promise<Response>;
};

function makeLeadRequest(host: string, body: Record<string, unknown>): Request {
  return new Request(`https://${host}/api/public/leads`, {
    method: "POST",
    headers: {
      host,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("Isolamento de /api/public/leads (Prompt 18)", () => {
  beforeEach(() => {
    process.env.APP_PANEL_HOST = "172.212.145.134";
    process.env.APP_BASE_URL = "http://172.212.145.134";
    process.env.LP_FALLBACK_ENABLED = "false";
    process.env.TRUSTED_PROXY = "0";
    createdLeads = [];
    enqueuedLeadIds = [];
    rateAllowed = true;
  });

  it("captura lead válido sem cookie, preservando UTMs, payload e enfileiramento", async () => {
    const res = await POST(
      makeLeadRequest("a.cliente1.com", {
        landingPageId: "lp-a",
        slug: "oferta-a",
        name: "Maria",
        email: "maria@exemplo.com",
        phone: "11999999999",
        utmData: {
          utm_source: "meta",
          utm_medium: "cpc",
          utm_campaign: "blackfriday",
        },
        tenantId: "tenant-falso-ignorado",
        host: "host-falso-ignorado",
      })
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(createdLeads.length, 1);
    assert.equal(createdLeads[0].tenantId, "tenant-1");
    assert.equal(createdLeads[0].landingPageId, "lp-a");
    assert.equal((createdLeads[0].utmData as Record<string, unknown>).utm_source, "meta");
    assert.deepEqual(enqueuedLeadIds, ["lead-1"]);
  });

  it("rejeita host desconhecido e host do painel sem gravar lead", async () => {
    const unknownRes = await POST(
      makeLeadRequest("desconhecido.com", {
        landingPageId: "lp-a",
        email: "lead@exemplo.com",
      })
    );
    assert.equal(unknownRes.status, 404);
    assert.equal(createdLeads.length, 0);

    const panelRes = await POST(
      makeLeadRequest("172.212.145.134", {
        landingPageId: "lp-a",
        email: "lead@exemplo.com",
      })
    );
    assert.equal(panelRes.status, 404);
    assert.equal(createdLeads.length, 0);
  });

  it("ignora body.host falsificado quando Host real é desconhecido ou pertence a outro domínio", async () => {
    const spoofedOnUnknown = await POST(
      makeLeadRequest("desconhecido.com", {
        host: "a.cliente1.com",
        landingPageId: "lp-a",
        email: "lead@exemplo.com",
      })
    );
    assert.equal(spoofedOnUnknown.status, 404);
    assert.equal(createdLeads.length, 0);

    const spoofedCrossDomain = await POST(
      makeLeadRequest("a.cliente1.com", {
        host: "b.cliente1.com",
        landingPageId: "lp-b",
        slug: "oferta-b",
        email: "lead@exemplo.com",
      })
    );
    assert.equal(spoofedCrossDomain.status, 404);
    assert.equal(createdLeads.length, 0);
  });

  it("rejeita LP de outro domínio do mesmo tenant e LP de outro tenant sem gravar", async () => {
    const otherDomainSameTenant = await POST(
      makeLeadRequest("a.cliente1.com", {
        landingPageId: "lp-b",
        email: "lead@exemplo.com",
      })
    );
    assert.equal(otherDomainSameTenant.status, 404);
    assert.equal(createdLeads.length, 0);

    const otherTenant = await POST(
      makeLeadRequest("a.cliente1.com", {
        landingPageId: "lp-c",
        email: "lead@exemplo.com",
      })
    );
    assert.equal(otherTenant.status, 404);
    assert.equal(createdLeads.length, 0);
  });

  it("rejeita payload sem identificação de LP (sem busca global) e respeita honeypot e rate limit", async () => {
    const missingLp = await POST(
      makeLeadRequest("a.cliente1.com", {
        email: "lead@exemplo.com",
      })
    );
    assert.equal(missingLp.status, 400);
    assert.equal(createdLeads.length, 0);

    const botRes = await POST(
      makeLeadRequest("a.cliente1.com", {
        landingPageId: "lp-a",
        email: "bot@exemplo.com",
        _gotcha: "spam",
      })
    );
    assert.equal(botRes.status, 200);
    assert.equal(createdLeads.length, 0);

    rateAllowed = false;
    const limitedRes = await POST(
      makeLeadRequest("a.cliente1.com", {
        landingPageId: "lp-a",
        email: "lead@exemplo.com",
      })
    );
    assert.equal(limitedRes.status, 429);
    assert.equal(createdLeads.length, 0);
  });
});


it("IP confiável separa chaves de rate limit e forwarded headers são ignorados sem confiança", async () => {
  rateKeys = []; rateAllowed = true;
  process.env.TRUSTED_PROXY = "1";
  for (const ip of ["203.0.113.10", "203.0.113.11"]) {
    await POST(new Request("https://a.cliente1.com/api/public/leads", { method: "POST", headers: { host: "a.cliente1.com", "x-forwarded-for": ip }, body: "{}" }));
  }
  assert.deepEqual(rateKeys, ["public_leads:203.0.113.10", "public_leads:203.0.113.11"]);
  process.env.TRUSTED_PROXY = "0";
  await POST(new Request("https://a.cliente1.com/api/public/leads", { method: "POST", headers: { host: "a.cliente1.com", "x-forwarded-for": "forged" }, body: "{}" }));
  assert.equal(rateKeys.at(-1), "public_leads:local");
});
