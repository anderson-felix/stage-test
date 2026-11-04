import { exigirSessao } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getPostMeta, getSlidesArray, SOCIAL_DIR } from "@/lib/social";
import { downloadTenantAssetBuffer } from "@/lib/storage";

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
 * GET ?path=...[&download=1] serve um arquivo de Arte (slide PNG ou PDF) diretamente do Blob Storage / MediaAsset
 * sem depender de `cerebro/`.
 */
export async function GET(request: Request) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const params = new URL(request.url).searchParams;
  const rawPath = (params.get("path") ?? "").trim();
  const isDownload = Boolean(params.get("download"));

  if (!rawPath) {
    return Response.json({ error: "parâmetro path obrigatório" }, { status: 400 });
  }

  // Caso 1: URL de MediaAsset (/api/media/<id>)
  const mediaMatch = /^\/api\/media\/([a-zA-Z0-9_-]+)/.exec(rawPath);
  if (mediaMatch) {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: mediaMatch[1], tenantId: sessao.tenantId },
    });
    if (!asset) {
      return Response.json({ error: "Ativo não encontrado" }, { status: 404 });
    }
    try {
      const dl = await downloadTenantAssetBuffer(asset.blobUrl);
      if (!dl) return Response.json({ error: "Blob não encontrado" }, { status: 404 });
      return new Response(new Uint8Array(dl.buffer), {
        headers: {
          "Content-Type": asset.mimeType || "image/png",
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

  // Caso 2: Caminho lógico marketing/social/<pauta>/<post>/arte/<arquivo>
  const segmentos = rawPath.split(/[\\/]/);
  const ext = rawPath.split(".").pop()?.toLowerCase() ?? "";
  if (
    !rawPath.startsWith(`${SOCIAL_DIR}/`) ||
    segmentos.includes("..") ||
    segmentos.length < 5 ||
    !TIPOS[ext]
  ) {
    return Response.json({ error: "arquivo não permitido" }, { status: 400 });
  }

  const pautaSlug = segmentos[2];
  const postSlug = segmentos[3];
  const fileName = segmentos[segmentos.length - 1];

  const pautaRow = await prisma.socialPauta.findUnique({
    where: {
      tenantId_slug: {
        tenantId: sessao.tenantId,
        slug: pautaSlug,
      },
    },
    include: { posts: true },
  });

  const postRow = pautaRow?.posts.find((p) => {
    const meta = getPostMeta(p.arteHistoryJson);
    return (meta.postSlug || `${p.platform}-${p.format}`) === postSlug;
  });

  if (postRow) {
    const slides = getSlidesArray(postRow.slidesBlobUrls);
    const slideMatch = /^slide-(\d+)\./i.exec(fileName);
    const targetUrl = slideMatch
      ? slides[Math.max(0, Number(slideMatch[1]) - 1)]
      : ext === "pdf"
        ? getPostMeta(postRow.arteHistoryJson).pdfUrl ?? null
        : slides[0];

    if (targetUrl) {
      const mAsset = /^\/api\/media\/([a-zA-Z0-9_-]+)/.exec(targetUrl);
      if (mAsset) {
        const asset = await prisma.mediaAsset.findFirst({
          where: { id: mAsset[1], tenantId: sessao.tenantId },
        });
        if (asset) {
          const dl = await downloadTenantAssetBuffer(asset.blobUrl);
          if (dl) {
            return new Response(new Uint8Array(dl.buffer), {
              headers: {
                "Content-Type": asset.mimeType || TIPOS[ext],
                "Cache-Control": "private, max-age=31536000, immutable",
                ...(isDownload
                  ? { "Content-Disposition": `attachment; filename="${pautaSlug}-${fileName}"` }
                  : {}),
              },
            });
          }
        }
      }

      const dl = await downloadTenantAssetBuffer(targetUrl).catch(() => null);
      if (dl) {
        return new Response(new Uint8Array(dl.buffer), {
          headers: {
            "Content-Type": TIPOS[ext],
            "Cache-Control": "private, max-age=31536000, immutable",
            ...(isDownload
              ? { "Content-Disposition": `attachment; filename="${pautaSlug}-${fileName}"` }
              : {}),
          },
        });
      }
    }
  }

  return Response.json({ error: "arquivo não encontrado" }, { status: 404 });
}
