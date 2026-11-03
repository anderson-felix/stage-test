import { exigirSessao } from "@/lib/auth";
import { htmlAutocontido } from "@/lib/lp";

// GET baixa o index.html da LP com o logo embutido: um arquivo só, pronto para publicar
export async function GET(_req: Request, ctx: RouteContext<"/api/lp/[slug]/download">) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const { slug } = await ctx.params;
  try {
    const html = await htmlAutocontido(slug, sessao.tenantId);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="lp-${slug}.html"`,
      },
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 404 });
  }
}
