import { atualizarCampanha, lerCampanha, type AtualizacaoCampanha, type StatusCampanha } from "@/lib/ads";

type Ctx = RouteContext<"/api/ads/campanhas/[slug]">;

// GET devolve a Campanha completa: briefing/estratégia, pesquisa, sementes, grupos, anúncios e arquivos
export async function GET(_req: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  const c = await lerCampanha(slug);
  return c ? Response.json(c) : Response.json({ error: "Campanha não encontrada" }, { status: 404 });
}

// PATCH { status?, lpUrl?, orcamentoDiario? }
export async function PATCH(request: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  const b = (await request.json()) as Record<string, unknown>;
  const m: AtualizacaoCampanha = {};
  if (typeof b.status === "string") m.status = b.status as StatusCampanha;
  if (typeof b.lpUrl === "string") m.lpUrl = b.lpUrl.trim();
  if (b.orcamentoDiario === null || typeof b.orcamentoDiario === "number") m.orcamentoDiario = b.orcamentoDiario;
  if (Object.keys(m).length === 0) return Response.json({ error: "nada para atualizar" }, { status: 400 });
  try {
    await atualizarCampanha(slug, m);
    return Response.json(await lerCampanha(slug));
  } catch (err) {
    const msg = (err as Error).message;
    return Response.json({ error: msg }, { status: msg === "Campanha não encontrada" ? 404 : 400 });
  }
}
