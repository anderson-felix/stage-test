import { getTenantContext } from "@/lib/tenant-context";
import { htmlAutocontido } from "@/lib/lp";
import { resolveLpHtmlAssets } from "@/lib/brand-assets";

// GET baixa o index.html da LP com o logo embutido e assets embutidos: um arquivo só, pronto para publicar e autônomo fora do Hub
export async function GET(_req: Request, routeCtx: { params: Promise<{ slug: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { slug } = await routeCtx.params;
  try {
    let html = await htmlAutocontido(slug, ctx.tenantId);
    html = await resolveLpHtmlAssets(html, ctx.tenantId, { embedAsDataUri: true });

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
