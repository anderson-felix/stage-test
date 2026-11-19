/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports -- Dynamic Prisma and Module interception at test boundaries only. */
import assert from "node:assert/strict";
import Module from "node:module";
import { test } from "node:test";
let row: any;
let domain: any;
let active = true;
let writes = 0;
const db: any = {
  landingPage: {
    findUnique: async () => row,
    update: async ({ data }: any) => { writes++; Object.assign(row, data); return row; },
  },
  customDomain: {
    findFirst: async ({ where }: any) => domain?.id === where.id && domain?.tenantId === where.tenantId ? domain : null,
    updateMany: async () => ({ count: 1 }),
  },
  tenant: { findUnique: async () => ({ isActive: active }) },
  $transaction: async (fn: any, opts: any) => { assert.equal(opts.isolationLevel, "Serializable"); return fn(db); },
};
const original = (Module as any)._load;
(Module as any)._load = function(id: string, ...args: any[]) {
  if (id === "./prisma" || id === "@/lib/prisma") return { __esModule: true, default: db, prisma: db };
  if (id === "@/lib/auth") return { exigirEditor: async () => ({ tenantId: "A" }) };
  if (id === "./tenant-context") return { resolverTenantId: async (id: string) => id };
  if (id === "./redis") return { invalidateTenantDomainMappings: async () => {} };
  return original.call(this, id, ...args);
};
const { atualizarLP } = require("../src/lib/lp");
const { PATCH, PUT } = require("../src/app/api/lp/[slug]/route");
const { reassociateLandingPageDomain } = require("../src/lib/domains");
(Module as any)._load = original;
test("edição real não promove legacyStatus; propriedade, TLS, tenant e snapshot em movimentação", async () => {
  row = { id: "lp", status: "DRAFT", briefingData: { legacyStatus: "publicada" }, purpose: "campanha", draftHtml: "A" };
  await assert.rejects(atualizarLP("lp", { status: "publicada" }, "A"), /endpoint/);
  await atualizarLP("lp", { draftHtml: "B" }, "A");
  assert.equal(row.status, "DRAFT");
  domain = { id: "d", tenantId: "B", domain: "lp.client.com", dnsStatus: "VERIFIED", sslStatus: "ACTIVE" };
  await assert.rejects(atualizarLP("lp", { customDomainId: "d" }, "A"), /pertence/);
  domain.tenantId = "A"; row.status = "PUBLISHED"; row.publishedBlobUrl = "https://storage.blob.core.windows.net/stage-media/A/lp_asset/2026-11/snapshot.html";
  domain.sslStatus = "PENDING";
  await assert.rejects(atualizarLP("lp", { customDomainId: "d" }, "A"), /TLS/);
  domain.sslStatus = "ACTIVE"; active = false;
  await assert.rejects(atualizarLP("lp", { customDomainId: "d" }, "A"), /tenant ativo/);
  active = true; row.publishedBlobUrl = null;
  await assert.rejects(atualizarLP("lp", { customDomainId: "d" }, "A"), /snapshot/);
  row.publishedBlobUrl = "https://storage.blob.core.windows.net/stage-media/B/lp_asset/2026-11/foreign.html";
  await assert.rejects(atualizarLP("lp", { customDomainId: "d" }, "A"), /Snapshot publicado inválido/);
  row.publishedBlobUrl = "https://storage.blob.core.windows.net/stage-media/A/lp_asset/2026-11/snapshot.html";
  await atualizarLP("lp", { customDomainId: "d" }, "A");
  assert.equal(row.briefingData.urlPublicada, "https://lp.client.com/lp");
  await atualizarLP("lp", { status: "rascunho" }, "A");
  assert.equal(row.status, "DRAFT"); assert.ok(writes > 0);
});
test("PATCH/PUT e reassociate executam serviço real e rejeitam caminhos alternativos", async () => {
  row = { id: "lp", slug: "lp", tenantId: "A", status: "PUBLISHED", purpose: "campanha", publishedBlobUrl: "https://storage.blob.core.windows.net/stage-media/A/lp_asset/2026-11/lp.html", briefingData: {} };
  domain = { id: "d", tenantId: "A", domain: "lp.client.com", dnsStatus: "VERIFIED", sslStatus: "PENDING" };
  for (const handler of [PATCH, PUT]) {
    for (const body of [{ status: "publicada" }, { customDomainId: "foreign" }, { customDomainId: "d" }]) {
      const response = await handler(new Request("http://localhost/api/lp/lp", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ slug: "lp" }) });
      assert.equal(response.status, 400);
    }
  }
  await assert.rejects(reassociateLandingPageDomain("A", { slug: "lp", customDomainId: "d" }), /TLS/);
  domain.sslStatus = "ACTIVE"; active = false;
  await assert.rejects(reassociateLandingPageDomain("A", { slug: "lp", customDomainId: "d" }), /tenant ativo/);
  active = true;
});
