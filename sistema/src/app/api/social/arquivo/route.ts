import { getTenantContext } from "@/lib/tenant-context";
import prisma from "@/lib/prisma";
import { getPostMeta, getSlidesArray } from "@/lib/social";
import { downloadTenantAssetBuffer } from "@/lib/storage";
import { resolverLogoDataUriTenant } from "@/lib/brand-assets";

const TIPOS: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

/**
 * GET /api/social/arquivo?path=...[&download=1]
 * ou GET /api/social/arquivo?pauta=<slug>&post=<slug>&file=slide-01.png
 *
 * Serve arquivos de Arte (slides PNG/WebP, PDF ou ativos de marca) diretamente do PostgreSQL
 * e Blob Storage (MediaAsset / BrandAsset), sem qualquer dependência de arquivos físicos locais em `cerebro/`.
 */
export async function GET(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawPath = (url.searchParams.get("path") ?? "").trim();
  const isDownload = Boolean(url.searchParams.get("download"));
  let pautaSlug = (url.searchParams.get("pauta") ?? "").trim();
  let postSlug = (url.searchParams.get("post") ?? "").trim();
  let fileName = (url.searchParams.get("file") ?? "").trim();

  if (!rawPath && !fileName) {
    return Response.json({ error: "parâmetro path ou file obrigatório" }, { status: 400 });
  }

  // Caso 1: O caminho solicitado é diretamente uma URL de MediaAsset (/api/media/<id>)
  const mediaMatch = /^\/api\/media\/([a-zA-Z0-9_-]+)/.exec(rawPath);
  if (mediaMatch) {
    const assetId = mediaMatch[1];
    const asset =
      (await prisma.mediaAsset.findFirst({
        where: { id: assetId, tenantId: ctx.tenantId },
      })) ??
      (await prisma.mediaAsset.findUnique({
        where: { id: assetId },
      }));

    if (!asset) {
      return Response.json({ error: "Ativo não encontrado" }, { status: 404 });
    }

    try {
      const dl = await downloadTenantAssetBuffer(asset.blobUrl);
      if (!dl) return Response.json({ error: "Blob não encontrado" }, { status: 404 });
      return new Response(new Uint8Array(dl.buffer), {
        headers: {
          "Content-Type": dl.mimeType || asset.mimeType || "image/png",
          "Cache-Control": "private, max-age=31536000, immutable",
          ...(isDownload
            ? { "Content-Disposition": `attachment; filename="${asset.fileName}"` }
            : {}),
        },
      });
    } catch {
      return Response.json({ error: "Blob não encontrado" }, { status: 404 });
    }
  }

  // Caso 2: Decomposição do caminho lógico (marketing/social/<pauta>/<post>/arte/<arquivo>)
  const cleanPath = rawPath.replace(/^\/+/, "");
  const segmentos = cleanPath.split(/[\\/]/).filter(Boolean);

  if (!fileName && segmentos.length > 0) {
    fileName = segmentos[segmentos.length - 1];
  }

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  const idxSocial = segmentos.indexOf("social");
  if (!pautaSlug) {
    if (idxSocial !== -1 && segmentos.length > idxSocial + 2) {
      pautaSlug = segmentos[idxSocial + 1];
      postSlug = postSlug || segmentos[idxSocial + 2];
    } else if (segmentos.length >= 3) {
      pautaSlug =
        segmentos[segmentos.length - 3] === "arte"
          ? segmentos[segmentos.length - 4]
          : segmentos[0];
      postSlug =
        postSlug ||
        (segmentos[segmentos.length - 3] === "arte"
          ? segmentos[segmentos.length - 2]
          : segmentos[1]);
    }
  }

  // Caso 3: Solicitação de logotipo da marca (logo.png / logo.svg)
  if (/^logo(?:\.[a-z0-9]+)?$/i.test(fileName)) {
    const logoDataUri = await resolverLogoDataUriTenant(ctx.tenantId);
    if (logoDataUri) {
      const dataUriMatch = /^data:([^;]+);base64,(.+)$/.exec(logoDataUri);
      if (dataUriMatch) {
        const mimeType = dataUriMatch[1];
        const buffer = Buffer.from(dataUriMatch[2], "base64");
        return new Response(new Uint8Array(buffer), {
          headers: {
            "Content-Type": mimeType,
            "Cache-Control": "private, max-age=31536000, immutable",
            ...(isDownload ? { "Content-Disposition": `attachment; filename="logo.png"` } : {}),
          },
        });
      }
    }
  }

  // Caso 4: Busca do SocialPost no banco de dados filtrado estritamente por ctx.tenantId
  let postRow: (typeof prisma.socialPost extends { findFirst: (...args: any[]) => Promise<infer R> } ? NonNullable<R> : never) | null = null;

  if (pautaSlug) {
    const pautaRow = await prisma.socialPauta.findUnique({
      where: {
        tenantId_slug: {
          tenantId: ctx.tenantId,
          slug: pautaSlug,
        },
      },
      include: { posts: true },
    });

    if (pautaRow) {
      postRow =
        pautaRow.posts.find((p) => {
          const meta = getPostMeta(p.arteHistoryJson);
          return (
            (meta.postSlug || `${p.platform}-${p.format}`) === postSlug ||
            p.id === postSlug ||
            p.format === postSlug ||
            p.platform === postSlug
          );
        }) ||
        pautaRow.posts[0] ||
        null;
    }
  }

  if (!postRow && postSlug) {
    postRow = await prisma.socialPost.findFirst({
      where: {
        tenantId: ctx.tenantId,
        OR: [{ id: postSlug }, { platform: postSlug }],
      },
    });
  }

  // Caso 5: Se o post foi localizado, busca o slide correspondente em slidesBlobUrls
  if (postRow) {
    const slides = getSlidesArray(postRow.slidesBlobUrls);
    const slideMatch = /^slide-?(\d+)\./i.exec(fileName);

    let targetUrl: string | null = null;
    if (slideMatch) {
      const slideIdx = Math.max(0, Number(slideMatch[1]) - 1);
      targetUrl = slides[slideIdx] || null;
    } else if (ext === "pdf") {
      targetUrl = getPostMeta(postRow.arteHistoryJson).pdfUrl ?? null;
    } else if (slides.length > 0) {
      targetUrl = slides[0];
    }

    if (targetUrl) {
      // 5.1 Se targetUrl for Data URI (gerado por canvas ou render Playwright)
      const dataUriMatch = /^data:([^;]+);base64,(.+)$/.exec(targetUrl);
      if (dataUriMatch) {
        const mimeType = dataUriMatch[1];
        const buffer = Buffer.from(dataUriMatch[2], "base64");
        return new Response(new Uint8Array(buffer), {
          headers: {
            "Content-Type": mimeType,
            "Cache-Control": "private, max-age=31536000, immutable",
            ...(isDownload
              ? { "Content-Disposition": `attachment; filename="${pautaSlug || "post"}-${fileName}"` }
              : {}),
          },
        });
      }

      // 5.2 Se targetUrl for referência /api/media/<id>
      const mAsset = /^\/api\/media\/([a-zA-Z0-9_-]+)/.exec(targetUrl);
      if (mAsset) {
        const asset =
          (await prisma.mediaAsset.findFirst({
            where: { id: mAsset[1], tenantId: ctx.tenantId },
          })) ??
          (await prisma.mediaAsset.findUnique({
            where: { id: mAsset[1] },
          }));

        if (asset) {
          const dl = await downloadTenantAssetBuffer(asset.blobUrl);
          if (dl) {
            return new Response(new Uint8Array(dl.buffer), {
              headers: {
                "Content-Type": dl.mimeType || asset.mimeType || TIPOS[ext] || "image/png",
                "Cache-Control": "private, max-age=31536000, immutable",
                ...(isDownload
                  ? { "Content-Disposition": `attachment; filename="${pautaSlug || "post"}-${fileName}"` }
                  : {}),
              },
            });
          }
        }
      }

      // 5.3 Se targetUrl for URL de Blob Storage
      const dl = await downloadTenantAssetBuffer(targetUrl).catch(() => null);
      if (dl) {
        return new Response(new Uint8Array(dl.buffer), {
          headers: {
            "Content-Type": dl.mimeType || TIPOS[ext] || "image/png",
            "Cache-Control": "private, max-age=31536000, immutable",
            ...(isDownload
              ? { "Content-Disposition": `attachment; filename="${pautaSlug || "post"}-${fileName}"` }
              : {}),
          },
        });
      }
    }
  }

  // Caso 6: Busca direta em MediaAsset pelo nome do arquivo do tenant
  const mediaAsset = await prisma.mediaAsset.findFirst({
    where: {
      tenantId: ctx.tenantId,
      OR: [{ fileName }, { id: fileName.replace(/\.[^.]+$/, "") }],
    },
  });

  if (mediaAsset) {
    const dl = await downloadTenantAssetBuffer(mediaAsset.blobUrl).catch(() => null);
    if (dl) {
      return new Response(new Uint8Array(dl.buffer), {
        headers: {
          "Content-Type": dl.mimeType || mediaAsset.mimeType || TIPOS[ext] || "image/png",
          "Cache-Control": "private, max-age=31536000, immutable",
          ...(isDownload
            ? { "Content-Disposition": `attachment; filename="${mediaAsset.fileName}"` }
            : {}),
        },
      });
    }
  }

  return Response.json({ error: "arquivo não encontrado" }, { status: 404 });
}
