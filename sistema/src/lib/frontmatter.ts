import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type Frontmatter = Record<string, unknown>;

/** Separa o frontmatter YAML (entre `---`) do corpo Markdown. */
export function splitFrontmatter(text: string): { data: Frontmatter; body: string } {
  const semBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(semBom);
  if (!match) return { data: {}, body: semBom };
  const data = parseYaml(match[1]);
  return { data: data && typeof data === "object" ? (data as Frontmatter) : {}, body: semBom.slice(match[0].length) };
}

/** Grava o frontmatter na ordem original; valores vazios viram `chave:` (como os arquivos nascem). */
export function joinFrontmatter(data: Frontmatter, body: string): string {
  const lines = Object.entries(data).map(([k, v]) =>
    v === null || v === undefined || v === "" ? `${k}:` : stringifyYaml({ [k]: v }).trimEnd(),
  );
  return `---\n${lines.join("\n")}\n---\n${body.startsWith("\n") ? body.slice(1) : body}`;
}

/** "Adoção de IA não é TI!" → "adocao-de-ia-nao-e-ti" (até ~50 caracteres, sem cortar palavra). */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= 50) return slug || "item";
  const cut = slug.slice(0, 50);
  return cut.slice(0, cut.lastIndexOf("-") > 20 ? cut.lastIndexOf("-") : 50);
}
