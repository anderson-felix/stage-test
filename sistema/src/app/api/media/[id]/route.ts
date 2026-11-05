import { exigirEditor } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { downloadTenantAssetBuffer } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/media/[id] serve o conteúdo binário público seguro de um MediaAsset
// (para visualização no painel, LPs públicas, render Playwright e Meta Graph API)
export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
  });
  if (!asset) {
    return Response.json({ error: "Mídia não encontrada" }, { status: 404 });
  }

  const downloaded = await downloadTenantAssetBuffer(asset.blobUrl);
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

// DELETE /api/media/[id] exclui o registro de mídia do tenant autenticado
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

  await prisma.mediaAsset.delete({ where: { id: asset.id } });
  return Response.json({ ok: true });
}
