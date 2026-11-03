import { exigirEditor, exigirSessao } from "@/lib/auth";
import { atualizarCampanha, lerCampanha, type AtualizacaoCampanha, type StatusCampanha } from "@/lib/ads";

type Ctx = RouteContext<"/api/ads/campanhas/[slug]">;

// GET devolve a Campanha completa do tenant autenticado
export async function GET(_req: Request, ctx: Ctx) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;
  const { slug } = await ctx.params;
  const c = await lerCampanha(slug, sessao.tenantId);
  return c ? Response.json(c) : Response.json({ error: "Campanha não encontrada" }, { status: 404 });
}

// PATCH { status?, lpUrl?, orcamentoDiario?, strategyMarkdown? }
export async function PATCH(request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { slug } = await ctx.params;
  const b = (await request.json()) as Record<string, unknown>;
  const m: AtualizacaoCampanha = {};
  if (typeof b.status === "string") m.status = b.status as StatusCampanha;
  if (typeof b.lpUrl === "string") m.lpUrl = b.lpUrl.trim();
  if (b.orcamentoDiario === null || typeof b.orcamentoDiario === "number") {
    m.orcamentoDiario = b.orcamentoDiario;
  }
  if (typeof b.strategyMarkdown === "string") {
    m.strategyMarkdown = b.strategyMarkdown;
  }
  if (Object.keys(m).length === 0) return Response.json({ error: "nada para atualizar" }, { status: 400 });
  try {
    await atualizarCampanha(slug, m, sessao.tenantId);
    return Response.json(await lerCampanha(slug, sessao.tenantId));
  } catch (err) {
    const msg = (err as Error).message;
    return Response.json({ error: msg }, { status: msg === "Campanha não encontrada" ? 404 : 400 });
  }
}
