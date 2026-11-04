import { exigirEditor, usuarioAtual } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDomainMapping, normalizeHostname } from "@/lib/redis";
import { downloadTenantAssetBuffer } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/media/[id] serve o conteúdo binário de um MediaAsset (no painel autenticado ou em LP pública/OAuth)
export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const sessao = await usuarioAtual();

  let allowedTenantId: string | null = sessao?.tenantId ?? null;
  if (!allowedTenantId) {
    const rawHost =
      request.headers.get("x-forwarded-host")?.split(",")[0] ||
      request.headers.get("host") ||
      "";
    const host = normalizeHostname(rawHost);
    if (host) {
      const mapping = await getDomainMapping(host);
      if (mapping) allowedTenantId = mapping.tenantId;
    }
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: {
      id,
      ...(allowedTenantId ? { tenantId: allowedTenantId } : {}),
    },
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
      "Cache-Control": "public, max-age=3600",
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
