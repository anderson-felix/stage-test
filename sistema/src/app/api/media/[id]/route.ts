import { exigirEditor } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  StorageConfigError,
  StorageOperationError,
  deleteTenantAssetBlob,
  downloadTenantAssetBuffer,
} from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/media/[id] serve o conteúdo binário público seguro de um MediaAsset
// mediado exclusivamente pelo backend a partir do container privado do Azure Blob Storage.
export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
  });
  if (!asset) {
    return Response.json({ error: "Mídia não encontrada" }, { status: 404 });
  }

  let downloaded: Awaited<ReturnType<typeof downloadTenantAssetBuffer>>;
  try {
    downloaded = await downloadTenantAssetBuffer(asset.blobUrl, {
      expectedTenantId: asset.tenantId,
    });
  } catch (err) {
    const status =
      err instanceof StorageConfigError || err instanceof StorageOperationError
        ? err.statusCode
        : 503;
    const code =
      err instanceof StorageConfigError || err instanceof StorageOperationError
        ? err.code
        : "STORAGE_READ_FAILED";
    return Response.json({ error: (err as Error).message, code }, { status });
  }

  if (!downloaded) {
    return Response.json({ error: "Arquivo binário não encontrado no storage" }, { status: 404 });
  }

  return new Response(new Uint8Array(downloaded.buffer), {
    headers: {
      "Content-Type": downloaded.mimeType || asset.mimeType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

// DELETE /api/media/[id] exclui o objeto no Azure Blob Storage e o registro de mídia do tenant autenticado
export async function DELETE(_request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { id } = await ctx.params;
  const asset = await prisma.mediaAsset.findFirst({
    where: { id, tenantId: sessao.tenantId },
  });
  if (!asset) {
    return Response.json({ error: "Mídia não encontrada" }, { status: 404 });
  }

  await deleteTenantAssetBlob(asset.blobUrl, {
    expectedTenantId: sessao.tenantId,
  }).catch(() => undefined);

  await prisma.mediaAsset.delete({ where: { id: asset.id } });
  return Response.json({ ok: true });
}
