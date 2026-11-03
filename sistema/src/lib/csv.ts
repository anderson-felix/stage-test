/** Lê CSV/TSV (RFC 4180: aspas, aspas duplicadas, quebra de linha dentro de aspas). */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}

/** Decodifica o arquivo respeitando o BOM: o Planejador do Google exporta em UTF-16. */
export function decodeTexto(buf: Uint8Array): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf.subarray(2));
  // UTF-16 sem BOM: metade dos bytes é zero nos primeiros caracteres ASCII
  if (buf.length > 4 && buf[1] === 0 && buf[3] === 0) return new TextDecoder("utf-16le").decode(buf);
  const texto = new TextDecoder("utf-8").decode(buf);
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

/** Escolhe o separador mais frequente na linha de amostra. */
export function detectarSeparador(amostra: string): string {
  const candidatos = ["\t", ";", ","];
  return candidatos.reduce((melhor, c) => (amostra.split(c).length > amostra.split(melhor).length ? c : melhor), ",");
}
