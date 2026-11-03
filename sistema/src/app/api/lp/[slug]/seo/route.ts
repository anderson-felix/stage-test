import { exigirSessao } from "@/lib/auth";
import { lerLP } from "@/lib/lp";
import { analyzeLandingPageSeo } from "@/lib/seo-analyzer";

type Ctx = RouteContext<"/api/lp/[slug]">;

export async function GET(_request: Request, ctx: Ctx) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const { slug } = await ctx.params;
  const lp = await lerLP(slug, sessao.tenantId);
  if (!lp) {
    return Response.json({ error: "LP não encontrada" }, { status: 404 });
  }

  const report = analyzeLandingPageSeo(lp.draftHtml, {
    lpTitle: lp.titulo,
  });

  return Response.json(report);
}

