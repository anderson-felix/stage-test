import { getTenantContext } from "@/lib/tenant-context";
import { lerArquivoCampanha } from "@/lib/ads";

// GET ?path=marketing/ads/campanhas/<slug>/ads-editor/<arquivo>.csv baixa um arquivo da Campanha do tenant autenticado
export async function GET(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  const rel = new URL(request.url).searchParams.get("path") ?? "";
  const arq = await lerArquivoCampanha(rel, ctx.tenantId);
  if (!arq) {
    return Response.json({ error: "arquivo não encontrado" }, { status: 404 });
  }
  return new Response(arq.content, {
    headers: {
      "Content-Type": arq.contentType,
      "Content-Disposition": `attachment; filename="${arq.filename}"`,
    },
  });
}
