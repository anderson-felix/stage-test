import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { workspaceDir } from "@/lib/config";
import { countFiles } from "@/lib/workspace";

const run = promisify(execFile);
const SITE_URL = process.env.SITE_URL ?? "https://stage.consulting";
const MEMORY_FILES = ["contexto/negocio.md", "contexto/voz.md", "contexto/foco.md", "marca/guia-visual.md"];

async function siteStatus() {
  const start = Date.now();
  try {
    const res = await fetch(SITE_URL, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000), cache: "no-store" });
    return { url: SITE_URL, online: res.ok, status: res.status, ms: Date.now() - start, https: SITE_URL.startsWith("https://") };
  } catch {
    return { url: SITE_URL, online: false, status: 0, ms: Date.now() - start, https: SITE_URL.startsWith("https://") };
  }
}

async function workspaceStatus() {
  const root = workspaceDir();
  const memory = await Promise.all(
    MEMORY_FILES.map(async (f) => {
      try {
        const text = await fs.readFile(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ root, f), "utf8");
        // Considera preenchido se tem conteúdo além dos títulos e citações do template
        const body = text.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith(">"));
        return { file: f, filled: body.length > 3 };
      } catch {
        return { file: f, filled: false };
      }
    }),
  );
  let lastChange: { when: string; subject: string } | null = null;
  try {
    const { stdout } = await run("git", ["log", "-1", "--format=%cI|%s"], { cwd: root });
    const [when, ...subject] = stdout.trim().split("|");
    if (when) lastChange = { when, subject: subject.join("|") };
  } catch {}
  return { files: await countFiles(), memory, lastChange };
}

export async function GET() {
  const [site, workspace] = await Promise.all([siteStatus(), workspaceStatus()]);
  return Response.json({ site, workspace, social: { connected: false }, ads: { connected: false } });
}
