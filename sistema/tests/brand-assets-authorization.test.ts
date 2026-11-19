/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports -- Dynamic Prisma and Module interception at test boundaries only. */
import assert from "node:assert/strict";
import Module from "node:module";
import { test } from "node:test";
import { load } from "cheerio";

let downloads: string[] = [];
let uploads: string[] = [];
const domain = { id: "d", tenantId: "A", domain: "lp.client.com", dnsStatus: "VERIFIED", sslStatus: "ACTIVE" };
const row: any = { id: "lp", slug: "lp", tenantId: "A", title: "LP", draftHtml: '<img src="/api/media/owned">',
  tenant: { isActive: true }, customDomainId: "d", customDomain: domain, briefingData: {}, trackingConfig: {}, updatedAt: new Date(), publishedBlobUrl: "https://storage/A/old.html" };
const prisma: any = {
  landingPage: { findUnique: async () => row, findFirst: async () => ({ id: "lp" }), update: async ({ data }: any) => Object.assign(row, data) },
  tenant: { findUnique: async () => ({ id: "A", isActive: true }) },
  customDomain: { findFirst: async () => domain, updateMany: async () => ({ count: 0 }) },
  brandProfile: { findUnique: async () => null },
  mediaAsset: {
    findFirst: async () => null,
    findMany: async ({ where }: any) => where.tenantId === "A" && where.id.in.includes("owned")
      ? [{ id: "owned", tenantId: "A", blobUrl: "A/image", mimeType: "image/png" }] : [],
  },
};
prisma.$transaction = async (fn: any) => fn(prisma);
const original = (Module as any)._load;
(Module as any)._load = function (id: string, ...args: any[]) {
  if (id === "./prisma" || id === "@/lib/prisma") return { __esModule: true, default: prisma, prisma };
  if (id === "@/lib/auth") return { exigirEditor: async () => ({ tenantId: "A" }) };
  if (id === "./redis" || id === "@/lib/redis") return { invalidateDomainMapping: async () => {} };
  if (id === "./tenant-context") return { resolverTenantId: async (id: string) => id };
  if (id === "./storage" || id === "@/lib/storage") return {
    StorageConfigError: class extends Error {}, StorageOperationError: class extends Error {},
    uploadTenantAsset: async ({ buffer }: any) => { uploads.push(buffer.toString()); return { id: "new", blobUrl: "https://storage/A/new.html" }; },
    deleteTenantAssetBlob: async () => {},
    downloadTenantAssetBuffer: async (url: string, opts: any) => {
    assert.equal(opts.expectedTenantId, "A"); downloads.push(url);
    return { buffer: Buffer.from("owned-by-A"), mimeType: "image/png" };
  } };
  return original.call(this, id, ...args);
};
const { inlineMediaAssetsAsDataUris, resolveHtmlBrandAssets } = require("../src/lib/brand-assets");
const { htmlAutocontido } = require("../src/lib/lp");
const { POST } = require("../src/app/api/lp/[slug]/publicar/route");
(Module as any)._load = original;

test("cadeia real htmlAutocontido incorpora mídia própria com tenant", async () => {
  downloads = [];
  assert.match(await htmlAutocontido("lp", "A"), /data:image\/png;base64,b3duZWQtYnktQQ==/);
  assert.deepEqual(downloads, ["A/image"]);
});
test("mídia de outro tenant aborta antes de qualquer download, inclusive preview", async () => {
  downloads = [];
  await assert.rejects(inlineMediaAssetsAsDataUris('<img src="/api/media/foreign">', "A"), /não autorizada/);
  await assert.rejects(resolveHtmlBrandAssets('<img src="/api/media/foreign">', "A"), /não autorizada/);
  assert.deepEqual(downloads, []);
});
test("URLs completas, srcset e CSS; origem externa permanece intacta", async () => {
  process.env.APP_BASE_URL = "http://172.212.145.134";
  const result = await inlineMediaAssetsAsDataUris(`<img src="http://172.212.145.134/api/media/owned?q=1#x"
    srcset="/api/media/owned 1x, http://172.212.145.134/api/media/owned#x 2x">
    <style>.a{background:url('/api/media/owned?q=1')}</style>
    <div style="background:url(/api/media/owned)"></div>
    <img src="https://external.example/api/media/foreign">`, "A");
  assert.doesNotMatch(result, /172\.212\.145\.134data:|\/api\/media\/owned/);
  assert.match(result, /https:\/\/external.example\/api\/media\/foreign/);
  assert.equal((result.match(/data:image\/png/g) || []).length, 5);
  await assert.rejects(inlineMediaAssetsAsDataUris('<img src="http://172.212.145.134/api/media/foreign?q=1">', "A"));
});
test("POST real executa htmlAutocontido/conversor e preserva publicação após referência proibida", async () => {
  process.env.LP_FALLBACK_ENABLED = "false";
  const publish = () => POST(new Request("http://172.212.145.134/api/lp/lp/publicar", { method: "POST", body: JSON.stringify({ customDomainId: "d" }) }), { params: Promise.resolve({ slug: "lp" }) });
  downloads = []; uploads = [];
  row.draftHtml = '<img src="http://172.212.145.134/api/media/foreign">';
  assert.equal((await publish()).status, 403);
  assert.deepEqual(downloads, []); assert.deepEqual(uploads, []);
  assert.equal(row.publishedBlobUrl, "https://storage/A/old.html");
  row.draftHtml = '<img src="http://172.212.145.134/api/media/owned">';
  assert.equal((await publish()).status, 200);
  assert.match(uploads[0], /data:image\/png;base64/);
  assert.doesNotMatch(uploads[0], /172\.212\.145\.134data:/);
});
test("documento completo conserva doctype, estrutura, tema, metadados e scripts", async () => {
  const html = `<!DOCTYPE html><html lang="pt-BR" dir="ltr" data-site="lp"><head>
    <meta charset="utf-8"><meta name="description" content="SEO A">
    <style>body{background:red}.hero{background:url('/api/media/owned?q=1#x')}</style>
    <script>window.original = '<body>'; window.ready = true;</script></head>
    <body class="landing-theme" style="background:red" data-theme="A">
    <img src="/api/media/owned?q=1#x"></body></html>`;
  const result = await inlineMediaAssetsAsDataUris(html, "A", { mode: "document" });
  assert.match(result, /^<!DOCTYPE html>/i);
  const $ = load(result);
  for (const [name, value] of Object.entries({ lang: "pt-BR", dir: "ltr", "data-site": "lp" })) assert.equal($("html").attr(name), value);
  assert.equal($("body").attr("class"), "landing-theme");
  assert.equal($("body").attr("style"), "background:red");
  assert.equal($("body").attr("data-theme"), "A");
  assert.equal($("head meta[name=description]").attr("content"), "SEO A");
  assert.match($("head script").text(), /window.original = '<body>'/);
  assert.match($("head style").text(), /data:image\/png/);
  assert.match($("body img").attr("src")!, /^data:image\/png/);
});
test("fragmento explícito mantém fragmento sem criar documento", async () => {
  const result = await inlineMediaAssetsAsDataUris('<section class="slide"><img src="/api/media/owned"></section>', "A", { mode: "fragment" });
  assert.doesNotMatch(result, /<!doctype|<html|<head|<body/i);
  assert.match(result, /<section class="slide">/);
  assert.match(result, /data:image\/png/);
});
