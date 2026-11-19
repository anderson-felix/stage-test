// Local-only browser smoke. No app credentials, VM, provider or email requests.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const root = path.resolve("node_modules/monaco-editor/min");
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  if (pathname === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end(`<!doctype html><html><body><div id="editor" style="width:800px;height:500px"></div>
      <script src="/vs/loader.js"></script><script>
      require.config({paths:{vs:location.origin+'/vs'}});
      require(['vs/editor/editor.main'],function(){
        window.editor=monaco.editor.create(document.getElementById('editor'),{
          value:'<h1>Stage</h1>',language:'html',theme:'vs-dark',automaticLayout:true});
        window.ready=true;
      });</script></body></html>`);
    return;
  }
  const file = path.resolve(root, `.${decodeURIComponent(pathname)}`);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.setHeader("Content-Type", ({ ".js": "text/javascript", ".css": "text/css", ".ttf": "font/ttf", ".json": "application/json" })[path.extname(file)] || "application/octet-stream");
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.ready === true, { timeout: 30000 });
  assert.equal(await page.evaluate(() => window.editor.getValue()), "<h1>Stage</h1>");
  await page.evaluate(() => { window.editor.setValue("# Edição validada"); monaco.editor.setModelLanguage(window.editor.getModel(), "markdown"); });
  assert.equal(await page.evaluate(() => window.editor.getValue()), "# Edição validada");
  assert.equal(await page.evaluate(() => window.editor.getModel().getLanguageId()), "markdown");
  assert.ok(await page.locator(".monaco-editor").count());
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.editor.dispose());
  console.log("MONACO_SMOKE_OK: AMD loader, HTML/Markdown, edição, render e dispose; assets locais.");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
