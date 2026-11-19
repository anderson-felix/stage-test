import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MONACO_VERSION, MONACO_ASSET_BASE, configureMonacoLoader } from "../src/lib/monaco-runtime";
test("runtime Monaco e lockfile usam snapshot corrigido, sem CDN legado", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const installed = JSON.parse(readFileSync("node_modules/monaco-editor/package.json", "utf8"));
  assert.equal(pkg.dependencies["monaco-editor"], MONACO_VERSION);
  assert.equal(installed.version, MONACO_VERSION);
  let target = "";
  configureMonacoLoader({ config: (options) => { target = options.paths.vs; } });
  assert.equal(target, MONACO_ASSET_BASE);
  const sanitizer = readFileSync("node_modules/monaco-editor/esm/vs/base/browser/dompurify/dompurify.js", "utf8");
  assert.match(sanitizer, /DOMPurify 3\.4\.(?:17|18)/);
  assert.doesNotMatch(sanitizer, /DOMPurify 3\.4\.15/);
});
