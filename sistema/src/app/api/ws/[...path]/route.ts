import fs from "node:fs/promises";
import { exigirSessao } from "@/lib/auth";
import { lerPost, SOCIAL_DIR } from "@/lib/social";
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
 * GET /api/ws/<caminho no workspace> serve o arte.html (do banco ou disco) e seus arquivos para o Editor de Arte.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/ws/[...path]">) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

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

  // Se for o arte.html de um Post, busca primeiro do banco do tenant autenticado
  if (ext === "html" && rel.startsWith(`${SOCIAL_DIR}/`) && rel.endsWith("/arte/arte.html")) {
    const segs = rel.split("/");
    if (segs.length >= 5) {
      const pautaSlug = segs[2];
      const postSlug = segs[3];
      const post = await lerPost(pautaSlug, postSlug, sessao.tenantId);
      if (post?.arte.htmlContent) {
        return new Response(post.arte.htmlContent, {
          headers: {
            "Content-Type": TIPOS.html,
            "Cache-Control": "no-store",
            "Content-Security-Policy": CSP,
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }
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
