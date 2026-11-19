// Transforma cada <section class="tela"> de um HTML num PNG.
// Uso: node ferramentas/renderizar.mjs <arquivo.html> [largura] [altura]
// Padrão 1080 x 1350 (Instagram 4:5). Os PNGs saem na pasta do HTML: tela-01.png, tela-02.png...
import { chromium } from "playwright";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

const [arquivo, largura = "1080", altura = "1350"] = process.argv.slice(2);
if (!arquivo || !existsSync(arquivo)) {
  console.error("Uso: node ferramentas/renderizar.mjs <arquivo.html> [largura] [altura]");
  process.exit(1);
}

const caminho = resolve(arquivo);
const w = Number(largura);
const h = Number(altura);

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await pagina.goto(pathToFileURL(caminho).href, { waitUntil: "networkidle" });
await pagina.evaluate(() => document.fonts.ready);

const telas = await pagina.locator("section.tela").all();
if (telas.length === 0) {
  console.error('Nenhuma <section class="tela"> encontrada.');
  await navegador.close();
  process.exit(1);
}

for (const [i, tela] of telas.entries()) {
  const saida = join(dirname(caminho), `tela-${String(i + 1).padStart(2, "0")}.png`);
  await tela.screenshot({ path: saida });
  console.log(saida);
}

await navegador.close();
