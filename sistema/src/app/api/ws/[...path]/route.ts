import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant-context";
import prisma from "@/lib/prisma";
import { lerPost, getSlidesArray, SOCIAL_DIR } from "@/lib/social";
import { downloadTenantAssetBuffer } from "@/lib/storage";
import { resolverLogoDataUriTenant } from "@/lib/brand-assets";

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
 * GET /api/ws/<caminho lógico>
 *
 * Serve arte.html (do PostgreSQL), ativos do tenant (MediaAsset / Blob Storage) e templates neutros.
 * Blindado com isolamento multi-tenant estrito:
 * - Não autenticado retorna 401.
 * - Ativos de logo (Logotipo_Stage.png, logo.png, marca/assets/logo/...) retornam a logo do próprio tenant autenticado.
 * - Tenants diferentes de "stage-consulting" não podem ler arquivos de negócio/campanhas/posts em `cerebro/`.
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

  const fileName = rel.split("/").pop() ?? rel;

  // 2. Resolução Dinâmica de Logotipo da Marca do Próprio Tenant
  // Se o caminho terminar com Logotipo_Stage.png, logo.png ou contiver marca/assets/logo
  const isLogoRef =
    /logotipo_stage\.png$/i.test(fileName) ||
    /^logo\.(png|svg|webp|jpe?g)$/i.test(fileName) ||
    rel.includes("marca/assets/logo") ||
    rel.includes("marca/logo") ||
    rel === "logo.png";

  if (isLogoRef) {
    const brand = await prisma.brandProfile.findUnique({
      where: { tenantId: ctx.tenantId },
      select: { logoBlobUrl: true },
    });

    let logoBuffer: Buffer | null = null;
    let logoMimeType = "image/png";

    // 2.1 Se logoBlobUrl apontar para /api/media/[id]
    const mediaIdMatch = brand?.logoBlobUrl
      ? /^\/api\/media\/([a-zA-Z0-9_-]+)/.exec(brand.logoBlobUrl)
      : null;

    if (mediaIdMatch) {
      const assetId = mediaIdMatch[1];
      const asset =
        (await prisma.mediaAsset.findFirst({
          where: { id: assetId, tenantId: ctx.tenantId },
        })) ??
        (await prisma.mediaAsset.findUnique({
          where: { id: assetId },
        }));

      if (asset) {
        const dl = await downloadTenantAssetBuffer(asset.blobUrl);
        if (dl) {
          logoBuffer = dl.buffer;
          logoMimeType = dl.mimeType || asset.mimeType || "image/png";
        }
      }
    } else if (brand?.logoBlobUrl) {
      const dl = await downloadTenantAssetBuffer(brand.logoBlobUrl).catch(() => null);
      if (dl) {
        logoBuffer = dl.buffer;
        logoMimeType = dl.mimeType || "image/png";
      }
    }

    // 2.2 Se ainda não encontrou, busca um MediaAsset do tenant na categoria "logo"
    if (!logoBuffer) {
      const asset = await prisma.mediaAsset.findFirst({
        where: { tenantId: ctx.tenantId, category: "logo" },
        orderBy: { createdAt: "desc" },
      });
      if (asset) {
        const dl = await downloadTenantAssetBuffer(asset.blobUrl).catch(() => null);
        if (dl) {
          logoBuffer = dl.buffer;
          logoMimeType = dl.mimeType || asset.mimeType || "image/png";
        }
      }
    }

    // 2.3 Se ainda não encontrou no banco, tenta via Data URI
    if (!logoBuffer) {
      const dataUri = await resolverLogoDataUriTenant(ctx.tenantId);
      if (dataUri) {
        const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
        if (match) {
          logoMimeType = match[1];
          logoBuffer = Buffer.from(match[2], "base64");
        }
      }
    }

    // 2.4 Fallback para o logotipo neutro padrão de public/logo-stage.png
    if (!logoBuffer) {
      try {
        const fs = await import("fs/promises");
        const path = await import("path");
        const publicLogoPath = path.join(process.cwd(), "public", "logo-stage.png");
        logoBuffer = await fs.readFile(publicLogoPath);
        logoMimeType = "image/png";
      } catch {
        logoBuffer = null;
      }
    }

    if (logoBuffer) {
      return new Response(new Uint8Array(logoBuffer), {
        headers: {
          "Content-Type": logoMimeType,
          "Cache-Control": "public, max-age=86400",
          "Content-Security-Policy": CSP,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }

  // 3. Se for o arte.html de um Post, busca estritamente do banco de dados do tenant autenticado
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

  // 4. Busca em MediaAsset do tenant no PostgreSQL / Azure Blob Storage
  const asset = await prisma.mediaAsset.findFirst({
    where: {
      tenantId: ctx.tenantId,
      OR: [{ blobUrl: rel }, { fileName }, { id: fileName.replace(/\.[^.]+$/, "") }],
    },
    orderBy: { createdAt: "desc" },
  });

  if (asset) {
    const downloaded = await downloadTenantAssetBuffer(asset.blobUrl);
    if (downloaded) {
      return new Response(new Uint8Array(downloaded.buffer), {
        headers: {
          "Content-Type": downloaded.mimeType || asset.mimeType || TIPOS[ext] || "application/octet-stream",
          "Cache-Control": "private, max-age=3600",
          "Content-Security-Policy": CSP,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }

  // 5. Suporte a slides de posts do tenant
  if (/^slide-?(\d+)\./i.test(fileName)) {
    const slideNumMatch = /^slide-?(\d+)\./i.exec(fileName);
    const slideIdx = slideNumMatch ? Math.max(0, Number(slideNumMatch[1]) - 1) : 0;
    const segs = rel.split("/");
    const postSlug =
      segs.length >= 3
        ? segs[segs.length - 3] === "arte"
          ? segs[segs.length - 2]
          : segs[1]
        : null;

    if (postSlug) {
      const post = await prisma.socialPost.findFirst({
        where: {
          tenantId: ctx.tenantId,
          OR: [{ id: postSlug }, { platform: postSlug }],
        },
      });
      if (post?.slidesBlobUrls) {
        const slides = getSlidesArray(post.slidesBlobUrls);
        const targetUrl = slides[slideIdx];
        if (targetUrl) {
          if (targetUrl.startsWith("data:")) {
            const m = /^data:([^;]+);base64,(.+)$/.exec(targetUrl);
            if (m) {
              return new Response(new Uint8Array(Buffer.from(m[2], "base64")), {
                headers: {
                  "Content-Type": m[1],
                  "Cache-Control": "private, max-age=3600",
                  "Content-Security-Policy": CSP,
                  "X-Content-Type-Options": "nosniff",
                },
              });
            }
          }
          const dl = await downloadTenantAssetBuffer(targetUrl).catch(() => null);
          if (dl) {
            return new Response(new Uint8Array(dl.buffer), {
              headers: {
                "Content-Type": dl.mimeType || TIPOS[ext] || "image/png",
                "Cache-Control": "private, max-age=3600",
                "Content-Security-Policy": CSP,
                "X-Content-Type-Options": "nosniff",
              },
            });
          }
        }
      }
    }
  }

  // 6. Templates Neutros Permitidos para Qualquer Tenant (ex: carrossel/base.html)
  const isNeutralTemplate =
    rel === "carrossel/base.html" ||
    rel.endsWith("carrossel/base.html") ||
    rel.startsWith("templates/");

  if (isNeutralTemplate) {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const candidatePaths = [
        path.join(process.cwd(), "..", "cerebro", ".claude", "skills", "carrossel", "base.html"),
        path.join(process.cwd(), "..", "cerebro", "templates", fileName),
        path.join(process.cwd(), "public", "templates", fileName),
      ];
      for (const cand of candidatePaths) {
        try {
          const buf = await fs.readFile(cand);
          return new Response(new Uint8Array(buf), {
            headers: {
              "Content-Type": TIPOS[ext] || "text/html; charset=utf-8",
              "Cache-Control": "public, max-age=86400",
              "Content-Security-Policy": CSP,
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch {
          // tenta o próximo candidato
        }
      }
    } catch {
      // continua para bloqueio
    }
  }

  // 7. Isolamento Absoluto: Tenants que NÃO sejam "stage-consulting" são bloqueados
  // de acessar quaisquer arquivos de negócio/campanhas/posts físicos em cerebro/
  if (ctx.tenantSlug !== "stage-consulting") {
    return NextResponse.json({ error: "arquivo não encontrado" }, { status: 404 });
  }

  // Para o tenant "stage-consulting", apenas Super Admin pode inspecionar arquivos físicos locais legados
  if (!ctx.isSuperAdmin) {
    return NextResponse.json({ error: "arquivo não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ error: "arquivo não encontrado" }, { status: 404 });
}
