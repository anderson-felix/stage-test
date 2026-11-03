import fs from "node:fs/promises";
import { SOCIAL_DIR } from "@/lib/social";
import { resolveSafe } from "@/lib/workspace";

const TIPOS: Record<string, string> = {
  html: "text/html; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

// O arte.html é escrito pela IA: nenhum script roda nele, e ele só carrega arquivos daqui e Google Fonts.
const CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
].join("; ");

/** Só o arte.html dos Posts e imagens/fontes da Identidade e do Social. */
function permitido(rel: string, ext: string): boolean {
  if (ext === "html") return rel.startsWith(`${SOCIAL_DIR}/`) && rel.endsWith("/arte/arte.html");
  return rel.startsWith("marca/") || rel.startsWith(`${SOCIAL_DIR}/`);
}

/**
 * GET /api/ws/<caminho no workspace> serve o arte.html e seus arquivos para o Editor de Arte.
 * Os caminhos espelham o workspace, então os `../../marca/...` relativos do HTML funcionam como no render.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/ws/[...path]">) {
  const { path: partes } = await ctx.params;
  let rel: string;
  try {
    rel = partes.map((p) => decodeURIComponent(p)).join("/");
  } catch {
    return Response.json({ error: "caminho inválido" }, { status: 400 });
  }
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  if (rel.split(/[\\/]/).some((s) => s === ".." || s === ".") || !TIPOS[ext] || !permitido(rel, ext)) {
    return Response.json({ error: "arquivo não permitido" }, { status: 400 });
  }
  try {
    const buf = await fs.readFile(/*turbopackIgnore: true*/ resolveSafe(rel));
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": TIPOS[ext],
        "Cache-Control": "no-store",
        "Content-Security-Policy": CSP,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "arquivo não encontrado" }, { status: 404 });
  }
}
