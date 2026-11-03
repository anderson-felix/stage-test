// Confere os limites do Google Ads num CSV de anúncios responsivos de pesquisa.
// Uso: node ferramentas/validar-anuncios.mjs <anuncios.csv>
// Colunas lidas: Headline 1..15 (até 30), Description 1..4 (até 90), Path 1 e Path 2 (até 15).
import { readFileSync, existsSync } from "node:fs";

const arquivo = process.argv[2];
if (!arquivo || !existsSync(arquivo)) {
  console.error("Uso: node ferramentas/validar-anuncios.mjs <anuncios.csv>");
  process.exit(1);
}

// Leitor de CSV simples, com suporte a aspas e vírgula dentro do campo.
function lerCsv(texto) {
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((v) => v.trim() !== ""));
}

const [cabecalho, ...registros] = lerCsv(readFileSync(arquivo, "utf8").replace(/^﻿/, ""));
const limite = (nome) =>
  /^Headline \d+$/.test(nome) ? 30 : /^Description \d+$/.test(nome) ? 90 : /^Path [12]$/.test(nome) ? 15 : null;

const problemas = [];
registros.forEach((r, i) => {
  const grupo = r[cabecalho.indexOf("Ad Group")] || `linha ${i + 2}`;
  let titulos = 0, descricoes = 0;
  cabecalho.forEach((nome, j) => {
    const valor = (r[j] || "").trim();
    if (!valor) return;
    if (nome.startsWith("Headline")) titulos++;
    if (nome.startsWith("Description")) descricoes++;
    const max = limite(nome);
    if (max && valor.length > max) problemas.push(`${grupo} · ${nome}: ${valor.length}/${max} "${valor}"`);
  });
  if (titulos < 3) problemas.push(`${grupo}: ${titulos} títulos (mínimo 3; o ideal é de 10 a 15)`);
  if (descricoes < 2) problemas.push(`${grupo}: ${descricoes} descrições (mínimo 2; o ideal é 4)`);
});

if (problemas.length) {
  console.log(`${problemas.length} problema(s):`);
  problemas.forEach((p) => console.log("- " + p));
  process.exit(2);
}
console.log(`OK · ${registros.length} anúncio(s) dentro dos limites`);
