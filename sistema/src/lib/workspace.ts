import fs from "node:fs/promises";
import path from "node:path";
import { workspaceDir } from "./config";

const HIDDEN = new Set([".git", "node_modules", ".next", ".DS_Store"]);
export const MAX_READ_BYTES = 1024 * 1024;

export type Entry = {
  name: string;
  path: string; // relativo ao workspace, com "/"
  type: "dir" | "file";
  size: number;
  mtime: string;
};

/** Resolve um caminho relativo garantindo que ele não escape do workspace. */
export function resolveSafe(rel: string): string {
  const root = workspaceDir();
  const full = path.resolve(/*turbopackIgnore: true*/ root, rel || ".");
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("caminho fora do workspace");
  }
  return full;
}

function toRel(full: string): string {
  return path.relative(workspaceDir(), full).split(path.sep).join("/");
}

export async function listDir(rel: string): Promise<Entry[]> {
  const dir = resolveSafe(rel);
  const dirents = await fs.readdir(/*turbopackIgnore: true*/ dir, { withFileTypes: true });
  const entries = await Promise.all(
    dirents
      .filter((d) => !HIDDEN.has(d.name))
      .map(async (d) => {
        const full = path.join(/*turbopackIgnore: true*/ dir, d.name);
        const stat = await fs.stat(/*turbopackIgnore: true*/ full);
        return {
          name: d.name,
          path: toRel(full),
          type: d.isDirectory() ? "dir" : "file",
          size: stat.size,
          mtime: stat.mtime.toISOString(),
        } satisfies Entry;
      }),
  );
  return entries.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1,
  );
}

export async function readText(rel: string): Promise<string> {
  const full = resolveSafe(rel);
  const stat = await fs.stat(/*turbopackIgnore: true*/ full);
  if (stat.size > MAX_READ_BYTES) throw new Error("arquivo grande demais para abrir no editor");
  const buf = await fs.readFile(/*turbopackIgnore: true*/ full);
  if (buf.includes(0)) throw new Error("arquivo binário — não dá para abrir no editor");
  return buf.toString("utf8");
}

export async function writeText(rel: string, content: string): Promise<void> {
  await fs.writeFile(/*turbopackIgnore: true*/ resolveSafe(rel), content, "utf8");
}

/** Conta arquivos do workspace (ignorando pastas ocultas). */
export async function countFiles(rel = ""): Promise<number> {
  let total = 0;
  for (const e of await listDir(rel)) {
    total += e.type === "dir" ? await countFiles(e.path) : 1;
  }
  return total;
}
