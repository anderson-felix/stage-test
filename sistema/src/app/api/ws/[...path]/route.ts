import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant-context";
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
  css: "text/css; charset=utf-8",
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
 * Blindado contra Path Traversal e vazamento de arquivos do servidor.
 */
export async function GET(_req: Request, routeCtx: { params: Promise<{ path: string[] }> }) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { path: partes } = await routeCtx.params;
  if (!partes || partes.length === 0) {
    return NextResponse.json({ error: "caminho inválido" }, { status: 400 });
  }

  // 1. Bloqueio estrito de Path Traversal
  for (const p of partes) {
    if (p.includes("..") || p.includes("/") || p.includes("\\") || p === "." || p.trim() === "") {
      return NextResponse.json({ error: "tentativa de path traversal bloqueada" }, { status: 400 });
    }
  }

  let rel: string;
  try {
    rel = partes.map((p) => decodeURIComponent(p)).join("/");
  } catch {
    return NextResponse.json({ error: "caminho inválido" }, { status: 400 });
  }

  if (rel.split(/[\\/]/).some((s) => s === ".." || s === "." || s === "")) {
    return NextResponse.json({ error: "caminho inválido" }, { status: 400 });
  }

  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  if (!TIPOS[ext]) {
    return NextResponse.json({ error: "tipo de arquivo não permitido" }, { status: 400 });
  }

  // 2. Se for o arte.html de um Post, busca estritamente do banco do tenant autenticado
  if (ext === "html" && rel.startsWith(`${SOCIAL_DIR}/`) && rel.endsWith("/arte/arte.html")) {
    const segs = rel.split("/");
    if (segs.length >= 5) {
      const pautaSlug = segs[2];
      const postSlug = segs[3];
      const post = await lerPost(pautaSlug, postSlug, ctx.tenantId);
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
    return NextResponse.json({ error: "arte.html não encontrado" }, { status: 404 });
  }

  // 3. Busca em MediaAsset do tenant no PostgreSQL / Azure Blob Storage
  const fileName = rel.split("/").pop() ?? rel;
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      tenantId: ctx.tenantId,
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

  // 4. Ativos públicos da marca ou Super Admin
  if (rel === "logo.png" || rel.endsWith("/logo.png") || rel.startsWith("marca/")) {
    const brand = await prisma.brandProfile.findUnique({
      where: { tenantId: ctx.tenantId },
      select: { logoBlobUrl: true },
    });
    if (brand?.logoBlobUrl) {
      const downloaded = await downloadTenantAssetBuffer(brand.logoBlobUrl).catch(() => null);
      if (downloaded) {
        return new Response(new Uint8Array(downloaded.buffer), {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=86400",
            "Content-Security-Policy": CSP,
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }
  }

  // Clientes comuns não podem ler arquivos físicos do host
  if (!ctx.isSuperAdmin) {
    return NextResponse.json({ error: "arquivo não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ error: "arquivo não encontrado" }, { status: 404 });
}
