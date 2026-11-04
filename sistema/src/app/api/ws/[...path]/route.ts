import { exigirSessao } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { lerPost, SOCIAL_DIR } from "@/lib/social";
import { downloadTenantAssetBuffer } from "@/lib/storage";

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

const CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'none'",
  "form-action 'none'",
].join("; ");

/**
 * GET /api/ws/<caminho lógico> serve o arte.html (do PostgreSQL) e ativos do tenant no Azure Blob Storage.
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
  if (rel.split(/[\\/]/).some((s) => s === ".." || s === ".") || !TIPOS[ext]) {
    return Response.json({ error: "arquivo não permitido" }, { status: 400 });
  }

  // Se for o arte.html de um Post, busca do banco do tenant autenticado
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
    return Response.json({ error: "arte.html não encontrado" }, { status: 404 });
  }

  // Busca em MediaAsset do tenant no PostgreSQL / Azure Blob Storage
  const fileName = rel.split("/").pop() ?? rel;
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      tenantId: sessao.tenantId,
      OR: [{ blobUrl: rel }, { fileName }],
    },
    orderBy: { createdAt: "desc" },
  });

  if (asset) {
    const downloaded = await downloadTenantAssetBuffer(asset.blobUrl);
    if (downloaded) {
      return new Response(new Uint8Array(downloaded.buffer), {
        headers: {
          "Content-Type": asset.mimeType || TIPOS[ext],
          "Cache-Control": "private, max-age=3600",
          "Content-Security-Policy": CSP,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }

  return Response.json({ error: "arquivo não encontrado" }, { status: 404 });
}
