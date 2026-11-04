import { getTenantContext } from "@/lib/tenant-context";
import { htmlAutocontido } from "@/lib/lp";

// GET baixa o index.html da LP com o logo embutido: um arquivo só, pronto para publicar
export async function GET(_req: Request, routeCtx: { params: Promise<{ slug: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { slug } = await routeCtx.params;
  try {
    const html = await htmlAutocontido(slug, ctx.tenantId);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}.html"`,
      },
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 404 });
  }
}
