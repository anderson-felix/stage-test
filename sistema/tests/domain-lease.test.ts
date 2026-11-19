/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports -- Dynamic Prisma and Module interception at test boundaries only. */
import assert from "node:assert/strict";
import Module from "node:module";
import { test } from "node:test";
import { matches, apply } from "./helpers/durable-db";
let row: any;
let claims = 0;
let claimRace = false;
const db = { customDomain: {
  findFirst: async () => {
    const snapshot = structuredClone(row);
    if (claimRace) { row.lockedBy = "other-process"; row.lockedUntil = new Date(Date.now() + 60000); }
    return snapshot;
  },
  updateMany: async ({ where, data }: any) => {
    assert.ok(where.OR, "claim deve ser condicional no banco"); claims++;
    if (!matches(row, where)) return { count: 0 };
    apply(row, data); return { count: 1 };
  },
  update: async ({ where, data }: any) => {
    assert.ok(where.lockedBy); assert.ok(where.lockedUntil.gt);
    if (!matches(row, where)) throw new Error("LEASE_LOST");
    apply(row, data); return structuredClone(row);
  },
} };
const original = (Module as any)._load;
(Module as any)._load = function(id: string, ...args: any[]) {
  if (id === "./prisma") return { __esModule: true, default: db };
  if (id === "./redis") return { invalidateDomainMapping: async () => {}, checkRateLimit: async () => ({ allowed: true }), normalizeHostname: (h: string) => h };
  return original.call(this, id, ...args);
};
const { reconcileCaddyDomainTls, verifyCustomDomain } = require("../src/lib/domains");
(Module as any)._load = original;
const env = { ...process.env, DOMAIN_ROUTING_MODE: "direct-ip", DOMAIN_TARGET_IPV4: "172.212.145.134", CADDY_TLS_PROBE_HOST: "caddy" };
function reset() {
  claimRace = false;
  row = { id: "d", tenantId: "A", domain: "lp.client.com", dnsStatus: "VERIFIED", sslStatus: "PENDING", verificationToken: "token", createdAt: new Date(), lockedBy: null, lockedUntil: null, checkAttempts: 0, consecutiveFailures: 0 };
}
const failure = { connected: false, authorized: false, peerCertificate: null, errorCode: "ECONNREFUSED" };
test("claim TLS atômico; só um consumidor inicia I/O; lease expirado e executor antigo protegidos", async () => {
  reset(); const now = new Date(); let release!: () => void; let started!: () => void;
  const start = new Promise<void>(r => started = r);
  const gate = new Promise<void>(r => release = r);
  let calls = 0;
  const first = reconcileCaddyDomainTls("A", "d", { env, now, tlsHandshake: async () => { calls++; started(); await gate; return failure; } });
  await start;
  await assert.rejects(reconcileCaddyDomainTls("A", "d", { env, now, tlsHandshake: async () => { calls++; return failure; } }), /andamento/);
  assert.equal(calls, 1);
  await reconcileCaddyDomainTls("A", "d", { env, now: new Date(+now + 31000), tlsHandshake: async () => { calls++; return failure; } });
  const successor = structuredClone(row);
  release(); await assert.rejects(first, /LEASE_LOST/);
  assert.deepEqual(row, successor);
  assert.equal(calls, 2); assert.equal(claims, 2);
});
test("DNS manual também usa claim e persistência condicionais", async () => {
  reset(); row.dnsStatus = "PENDING";
  let calls = 0;
  await verifyCustomDomain("A", "d", { env, enforceRateLimit: false, dnsResolver: {
    resolve4: async () => { calls++; return ["172.212.145.134"]; },
    resolve6: async () => [], resolveTxt: async () => [["token"]],
  } });
  assert.equal(calls, 1); assert.equal(row.lockedBy, null);
});
test("lease adquirido por outro processo depois da leitura impede I/O externo", async () => {
  reset(); claimRace = true; let calls = 0;
  await assert.rejects(reconcileCaddyDomainTls("A", "d", { env, tlsHandshake: async () => { calls++; return failure; } }), /andamento/);
  assert.equal(calls, 0);
  assert.equal(row.lockedBy, "other-process");
  claimRace = false;
});
