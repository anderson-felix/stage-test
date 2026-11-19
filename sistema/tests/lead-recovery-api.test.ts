/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports -- Test-only Prisma/auth adapters; email and handlers are real. */
import assert from "node:assert/strict";
import Module from "node:module";
import { beforeEach, test } from "node:test";
import { matches, apply } from "./helpers/durable-db";
import { describeLeadNotificationResult } from "../src/lib/lead-notification-contract";
let lead: any;
let session: any;
let requests = 0;
let lastProviderPayload: unknown;
const db = { lpLead: {
  findFirst: async ({ where }: any) => matches(lead, where) ? structuredClone(lead) : null,
  findUnique: async () => structuredClone(lead),
  updateMany: async ({ where, data }: any) => {
    if (!matches(lead, where)) return { count: 0 };
    apply(lead, data); return { count: 1 };
  },
} };
const originalLoad = (Module as any)._load;
(Module as any)._load = function(id: string, ...args: any[]) {
  if (id === "./prisma" || id === "@/lib/prisma") return { __esModule: true, default: db, prisma: db };
  if (id === "@/lib/auth") return { exigirEditor: async () => session };
  return originalLoad.call(this, id, ...args);
};
const { POST } = require("../src/app/api/leads/[id]/resend/route");
(Module as any)._load = originalLoad;
const request = () => POST(new Request("http://localhost/api/leads/L/resend", { method: "POST" }), { params: Promise.resolve({ id: "L" }) });
beforeEach(() => {
  session = { tenantId: "A" }; requests = 0;
  process.env.RESEND_MASTER_API_KEY = "simulated-only";
  lead = { id: "L", tenantId: "A", emailDeliveryStatus: "queued", emailAttemptCount: 0,
    emailNextAttemptAt: null, emailFirstAttemptAt: null, emailPayload: null, emailLeaseUntil: null,
    payload: { name: "Teste" }, createdAt: new Date(), landingPage: { id: "lp", title: "LP", slug: "lp" },
    tenant: { name: "A", members: [], emailConfig: { leadDestinationEmails: ["test@example.test"],
      senderDomain: "example.test", senderEmail: "sender@example.test", verificationStatus: "VERIFIED", useStageFallback: false } } };
});
async function withFakeProvider(fn: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails"); requests++;
    lastProviderPayload = JSON.parse(String(init?.body));
    assert.equal(new Headers(init?.headers).get("Idempotency-Key"), "lead-notification/L");
    await new Promise(resolve => setImmediate(resolve));
    return Response.json({ id: "provider-L" });
  };
  try { await fn(); } finally { globalThis.fetch = original; }
}
test("API distingue aceite, já enviado e estados sem envio", async () => withFakeProvider(async () => {
  const sent = await request(); assert.equal(sent.status, 200);
  assert.equal((await sent.json()).outcome, "accepted");
  const repeated = await request(); assert.equal((await repeated.json()).outcome, "already_sent");
  assert.equal(requests, 1);
  for (const [status, http, outcome] of [
    ["queued", 202, "queued"], ["sending", 202, "processing"], ["retry_scheduled", 202, "retry_scheduled"],
    ["failed_final", 409, "failed_final"], ["ambiguous", 409, "ambiguous"],
    ["failed", 409, "failed_final"],
  ] as const) {
    lead.emailDeliveryStatus = status; lead.emailLeaseUntil = new Date(Date.now() + 60000);
    lead.emailNextAttemptAt = new Date(Date.now() + 60000);
    const res = await request(); const body = await res.json();
    assert.equal(res.status, http); assert.equal(body.outcome, outcome);
    assert.equal(body.ok, false); assert.equal(body.providerAccepted, false);
  }
  assert.equal(requests, 1);
  assert.equal(describeLeadNotificationResult("queued").httpStatus, 202);
}));
test("configuração corrigida recupera sem resetar contador, payload, chave ou firstAttemptAt", async () => withFakeProvider(async () => {
  lead.emailDeliveryStatus = "config_pending"; lead.emailAttemptCount = 3;
  process.env.RESEND_MASTER_API_KEY = "";
  const pending = await request(); assert.equal(pending.status, 422);
  assert.equal((await pending.json()).ok, false);
  assert.equal(lead.emailAttemptCount, 4);
  process.env.RESEND_MASTER_API_KEY = "simulated-only";
  const recovered = await request(); assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).outcome, "accepted");
  assert.equal(lead.emailAttemptCount, 5); assert.equal(requests, 1);
  const frozen = structuredClone(lead.emailPayload);
  const first = lead.emailFirstAttemptAt;
  lead.emailDeliveryStatus = "config_pending";
  lead.landingPage.title = "Título alterado depois da tentativa";
  const resumed = await request(); assert.equal(resumed.status, 200);
  assert.equal(lead.emailAttemptCount, 6);
  assert.equal(+lead.emailFirstAttemptAt, +first);
  assert.deepEqual(lead.emailPayload, frozen);
  assert.deepEqual(lastProviderPayload, frozen.payload);
}));
test("janela expirada e limite de tentativas exigem intervenção", async () => withFakeProvider(async () => {
  lead.emailDeliveryStatus = "config_pending"; lead.emailAttemptCount = 2;
  const first = new Date(Date.now() - 25 * 3600000); lead.emailFirstAttemptAt = first;
  assert.equal((await request()).status, 409);
  assert.equal(lead.emailDeliveryStatus, "ambiguous");
  assert.equal(+lead.emailFirstAttemptAt, +first); assert.equal(lead.emailAttemptCount, 2);
  lead.emailDeliveryStatus = "config_pending"; lead.emailFirstAttemptAt = null; lead.emailAttemptCount = 8;
  assert.equal((await request()).status, 409); assert.equal(lead.emailDeliveryStatus, "failed_final");
  assert.equal(requests, 0);
}));
test("outro tenant e permissão insuficiente não recuperam", async () => withFakeProvider(async () => {
  session = { tenantId: "B" }; assert.equal((await request()).status, 404);
  session = Response.json({ error: "Forbidden" }, { status: 403 }); assert.equal((await request()).status, 403);
  assert.equal(requests, 0);
}));
test("cliques concorrentes recuperam uma única notificação lógica", async () => withFakeProvider(async () => {
  lead.emailDeliveryStatus = "config_pending";
  const responses = await Promise.all([request(), request()]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 202]);
  assert.equal(requests, 1); assert.equal(lead.emailDeliveryStatus, "sent_custom");
}));
