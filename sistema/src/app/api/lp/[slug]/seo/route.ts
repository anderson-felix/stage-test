import { exigirEditor, exigirSessao } from "@/lib/auth";
import { lerLP } from "@/lib/lp";
import { analyzeLandingPageSeo } from "@/lib/seo-analyzer";
import { loadTenantPromptContext } from "@/lib/prompts";
import prisma from "@/lib/prisma";

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

export async function POST(_request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { slug } = await ctx.params;
  const lp = await lerLP(slug, sessao.tenantId);
  if (!lp) {
    return Response.json({ error: "LP não encontrada" }, { status: 404 });
  }

  // Carrega contexto da marca para validar prompts de SEO
  await loadTenantPromptContext(sessao.tenantId, {
    briefing: lp.briefing,
  });

  const report = analyzeLandingPageSeo(lp.draftHtml, {
    lpTitle: lp.titulo,
  });

  // Atualiza o seoMetadata da LP no PostgreSQL
  await prisma.landingPage.update({
    where: {
      tenantId_slug: {
        tenantId: sessao.tenantId,
        slug,
      },
    },
    data: {
      seoMetadata: report as unknown as import("@prisma/client").Prisma.InputJsonValue,
    },
  });

  return Response.json(report);
}
