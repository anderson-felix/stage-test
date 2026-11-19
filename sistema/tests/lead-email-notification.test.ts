/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports -- Dynamic Prisma and Module interception at test boundaries only. */
import { matches, apply } from "./helpers/durable-db";
import assert from "node:assert/strict";
import Module from "node:module";
import { beforeEach, describe, it } from "node:test";
import { DnsStatus } from "@prisma/client";

type LeadRecord = {
  emailAttemptCount?: number;
  emailLeaseUntil?: Date | null;
  emailLeaseOwner?: string | null;
  id: string;
  tenantId: string;
  landingPageId: string;
  payload: Record<string, unknown>;
  utmData: Record<string, unknown>;
  emailDeliveryStatus: string;
  createdAt: Date;
  landingPage: { id: string; title: string; slug: string };
  tenant: {
    id: string;
    name: string;
    emailConfig: {
      senderDomain: string | null;
      senderEmail: string | null;
      senderName: string | null;
      leadDestinationEmails: string[];
      verificationStatus: DnsStatus;
      useStageFallback: boolean;
    } | null;
    members: Array<{ user: { email: string } }>;
  };
};

let leads: LeadRecord[] = [];
let sentPayloads: Array<{ from: string; to: string[]; subject: string }> = [];

function resetLead(overrides?: Partial<LeadRecord>): void {
  sentPayloads = [];
  leads = [
    {
      id: "lead-1",
      tenantId: "t1",
      landingPageId: "lp-1",
      payload: { name: "João", email: "joao@cliente.com" },
      utmData: { utm_source: "meta" },
      emailDeliveryStatus: "queued",
      emailAttemptCount: 0,
      createdAt: new Date(),
      landingPage: { id: "lp-1", title: "Oferta Especial", slug: "oferta" },
      tenant: {
        id: "t1",
        name: "Empresa Teste",
        emailConfig: {
          senderDomain: "empresateste.com.br",
          senderEmail: "contato@empresateste.com.br",
          senderName: "Empresa Teste",
          leadDestinationEmails: ["vendas@empresateste.com.br"],
          verificationStatus: DnsStatus.VERIFIED,
          useStageFallback: false,
        },
        members: [{ user: { email: "owner@empresateste.com.br" } }],
      },
      ...overrides,
    },
  ];
}

const mockPrisma = {
  lpLead: {
    findUnique: async (args: { where: { id: string } }) =>
      structuredClone(leads.find((l) => l.id === args.where.id) ?? null),
    findMany: async (args: any) => leads.filter(l => matches(l, args.where)).map(l => ({ id: l.id })),
    updateMany: async (args: any) => {
      let count = 0;
      for (const l of leads) if (matches(l, args.where)) { apply(l, args.data); count++; }
      return { count };
    },
    update: async (args: { where: { id: string }; data: { emailDeliveryStatus: string } }) => {
      const l = leads.find((x) => x.id === args.where.id);
      if (!l) throw new Error("Lead not found");
      l.emailDeliveryStatus = args.data.emailDeliveryStatus;
      return l;
    },
  },
  $disconnect: async () => {},
};

const originalLoad = (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load;

(Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "./prisma" || request === "@/lib/prisma" || request === "../lib/prisma") {
    return { __esModule: true, default: mockPrisma, prisma: mockPrisma };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { sendLeadNotificationEmail, enqueueLeadNotification } = require("../src/lib/email-service") as typeof import("../src/lib/email-service");

process.env.STAGE_WORKER_DISABLE_AUTORUN = "1";
const { processPendingLeadNotifications } = require("../src/worker/index") as {
  processPendingLeadNotifications: () => Promise<void>;
};

describe("Notificação de leads de LP (Prompt 24)", () => {
  beforeEach(() => {
    delete process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
    delete process.env.STAGE_FALLBACK_FROM_EMAIL;
    process.env.RESEND_MASTER_API_KEY = "re_test_key";
    resetLead();
  });

  it("envia notificação com transporte simulado e evita duplicação em processamento repetido", async () => {
    const res1 = await sendLeadNotificationEmail("lead-1", {
      env: { ...process.env, RESEND_MASTER_API_KEY: "re_test_key" },
      transport: async (payload) => {
        sentPayloads.push({ from: payload.from, to: payload.to, subject: payload.subject });
        return { ok: true, status: 200 };
      },
    });
    assert.equal(res1.status, "sent_custom");
    assert.equal(leads[0].emailDeliveryStatus, "sent_custom");
    assert.equal(sentPayloads.length, 1);
    assert.match(sentPayloads[0].from, /contato@empresateste\.com\.br/);

    // Reprocessamento repetido não envia novamente
    const res2 = await sendLeadNotificationEmail("lead-1", {
      env: { ...process.env, RESEND_MASTER_API_KEY: "re_test_key" },
      transport: async (payload) => {
        sentPayloads.push({ from: payload.from, to: payload.to, subject: payload.subject });
        return { ok: true, status: 200 };
      },
    });
    assert.equal(res2.status, "already_sent");
    assert.equal(sentPayloads.length, 1);
  });

  it("não produz sucesso falso quando RESEND_MASTER_API_KEY está ausente", async () => {
    const res = await sendLeadNotificationEmail("lead-1", {
      env: { ...process.env, RESEND_MASTER_API_KEY: "" },
    });
    assert.equal(res.status, "config_pending");
    assert.equal(leads[0].emailDeliveryStatus, "config_pending");
    assert.equal(leads.length, 1); // lead preservado
  });

  it("não usa leads@stage.consult sem configuração explícita de remetente fallback autorizado", async () => {
    leads[0].tenant.emailConfig = {
      senderDomain: null,
      senderEmail: null,
      senderName: "Empresa",
      leadDestinationEmails: ["vendas@empresateste.com.br"],
      verificationStatus: DnsStatus.PENDING,
      useStageFallback: true,
    };

    const rejected = await sendLeadNotificationEmail("lead-1", {
      env: { ...process.env, RESEND_MASTER_API_KEY: "re_test_key" },
      transport: async (payload) => {
        sentPayloads.push({ from: payload.from, to: payload.to, subject: payload.subject });
        return { ok: true, status: 200 };
      },
    });
    assert.equal(rejected.status, "config_pending");
    assert.equal(sentPayloads.length, 0);

    // Quando STAGE_FALLBACK_FROM_EMAIL autorizado é configurado explicitamente, permite fallback
    leads[0].emailDeliveryStatus = "queued";
    const allowed = await sendLeadNotificationEmail("lead-1", {
      env: {
        ...process.env,
        RESEND_MASTER_API_KEY: "re_test_key",
        STAGE_FALLBACK_FROM_EMAIL: "notificacoes@stage.consulting",
      },
      transport: async (payload) => {
        sentPayloads.push({ from: payload.from, to: payload.to, subject: payload.subject });
        return { ok: true, status: 200 };
      },
    });
    assert.equal(allowed.status, "sent_fallback");
    assert.match(sentPayloads[0].from, /notificacoes@stage\.consulting/);
  });

  it("preserva o lead no banco quando o provedor falha (HTTP 422)", async () => {
    const res = await sendLeadNotificationEmail("lead-1", {
      env: { ...process.env, RESEND_MASTER_API_KEY: "re_test_key" },
      transport: async () => ({ ok: false, status: 422, errorMessage: "Invalid sender" }),
    });
    assert.equal(res.status, "failed_final");
    assert.equal(leads[0].emailDeliveryStatus, "failed_final");
    assert.equal(leads.length, 1);
  });

  it("modo sem Service Bus: polling do worker processa leads queued no PostgreSQL", async () => {
    // Simula captura persistida sem Service Bus
    delete process.env.RESEND_MASTER_API_KEY;
    await enqueueLeadNotification("lead-1");
    await new Promise(resolve => setImmediate(resolve));
    // Força estado queued para simular polling do worker antes do envio local
    leads[0].emailDeliveryStatus = "queued";
    delete process.env.RESEND_MASTER_API_KEY;
    await processPendingLeadNotifications();
    // Sem API key real, o worker processou a fila e marcou failed (sem sucesso falso e preservando lead)
    assert.equal(leads[0].emailDeliveryStatus, "config_pending");
    assert.equal(leads.length, 1);
  });
});


it("recupera lease abandonado e disputa entre consumidores sem sucesso falso", async () => {
  resetLead({ emailDeliveryStatus: "sending", emailLeaseOwner: "dead", emailLeaseUntil: new Date(0) });
  let count = 0;
  const transport = async () => { count++; await new Promise(r => setImmediate(r)); return { ok: true, status: 200 }; };
  const results = await Promise.all([sendLeadNotificationEmail("lead-1", { transport }), sendLeadNotificationEmail("lead-1", { transport })]);
  assert.equal(count, 1);
  assert.deepEqual(results.map(r => r.status).sort(), ["processing", "sent_custom"]);
});
it("persiste backoff e encerra falha permanente", async () => {
  resetLead(); const now = new Date();
  assert.equal((await sendLeadNotificationEmail("lead-1", { now, transport: async () => ({ ok: false, status: 503 }) })).status, "retry_scheduled");
  let calls = 0;
  await sendLeadNotificationEmail("lead-1", { now, transport: async () => { calls++; return { ok: true, status: 200 }; } });
  assert.equal(calls, 0);
  assert.equal((await sendLeadNotificationEmail("lead-1", { now: new Date(now.getTime() + 31000), transport: async () => ({ ok: false, status: 422 }) })).status, "failed_final");
});
it("resposta perdida reutiliza chave e payload; janela expirada exige reconciliação", async () => {
  resetLead(); const now = new Date();
  const accepted = new Map<string, string>(); let attempts = 0;
  const transport: import("../src/lib/email-service").LeadEmailTransport = async (payload, _apiKey, key) => {
    attempts++;
    const json = JSON.stringify(payload);
    if (accepted.has(key)) assert.equal(accepted.get(key), json);
    else accepted.set(key, json);
    if (attempts === 1) throw new Error("Resposta perdida após aceite");
    return { ok: true, status: 200, providerId: "resend-1" };
  };
  assert.equal((await sendLeadNotificationEmail("lead-1", { now, transport })).status, "retry_scheduled");
  leads[0].landingPage.title = "Rascunho alterado";
  assert.equal((await sendLeadNotificationEmail("lead-1", { now: new Date(+now + 31000), transport })).status, "sent_custom");
  assert.equal(accepted.size, 1);
  assert.equal((leads[0] as any).emailProviderId, "resend-1");
  (leads[0] as any).emailDeliveryStatus = "sending";
  (leads[0] as any).emailLeaseUntil = new Date(+now + 60000);
  assert.equal((await sendLeadNotificationEmail("lead-1", { now: new Date(+now + 25 * 3600000), transport })).status, "ambiguous");
  assert.equal(attempts, 2);
});
it("reinício depois do aceite e antes da persistência mantém a mesma notificação lógica", async () => {
  resetLead(); const now = new Date(); let accepted = 0;
  const keys = new Set<string>();
  const transport: import("../src/lib/email-service").LeadEmailTransport = async (_p, _a, key) => {
    if (!keys.has(key)) { keys.add(key); accepted++; }
    // Execução perdeu a posse antes de persistir a resposta.
    leads[0].emailLeaseOwner = "simulated-restart";
    return { ok: true, status: 200, providerId: "resend-2" };
  };
  assert.equal((await sendLeadNotificationEmail("lead-1", { now, transport })).status, "processing");
  assert.equal((await sendLeadNotificationEmail("lead-1", { now: new Date(+now + 61000), transport: async (p, a, key) => {
    assert.ok(keys.has(key)); return { ok: true, status: 200, providerId: "resend-2" };
  } })).status, "sent_custom");
  assert.equal(accepted, 1);
});
it("handler Service Bus duplicado usa transporte HTTP real simulado, chave e provider ID", async () => {
  resetLead(); let requests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    requests++;
    assert.equal(new Headers(init?.headers).get("Idempotency-Key"), "lead-notification/lead-1");
    await new Promise(r => setImmediate(r));
    return Response.json({ id: "provider-sb" });
  };
  process.env.RESEND_MASTER_API_KEY = "fake-test-only";
  try {
    const { processLeadMessage } = require("../src/worker/index");
    await Promise.all([processLeadMessage({ body: { leadId: "lead-1" } }), processLeadMessage({ body: { leadId: "lead-1" } })]);
    assert.equal(requests, 1);
    assert.equal((leads[0] as any).emailProviderId, "provider-sb");
  } finally { globalThis.fetch = originalFetch; }
});
it("Service Bus indisponível e oitavo lease abandonado não perdem nem prendem o trabalho", async () => {
  resetLead(); process.env.AZURE_SERVICE_BUS_CONNECTION_STRING = "invalid-connection-string";
  try { await enqueueLeadNotification("lead-1"); } finally { delete process.env.AZURE_SERVICE_BUS_CONNECTION_STRING; }
  assert.equal(leads[0].emailDeliveryStatus, "queued");
  leads[0].emailDeliveryStatus = "sending"; leads[0].emailAttemptCount = 8;
  leads[0].emailLeaseUntil = new Date(0);
  const res = await sendLeadNotificationEmail("lead-1", { transport: async () => { throw new Error("NÃO DEVE ENVIAR"); } });
  assert.equal(res.status, "ambiguous");
  assert.equal(leads[0].emailDeliveryStatus, "ambiguous");
});
