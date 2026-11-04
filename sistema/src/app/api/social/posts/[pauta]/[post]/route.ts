import { exigirEditor, exigirSessao } from "@/lib/auth";
import { atualizarPost, excluirPost, lerPost, type AtualizacaoPost } from "@/lib/social";

type Ctx = RouteContext<"/api/social/posts/[pauta]/[post]">;

// DELETE [?pauta=1] exclui o Post (ou a Pauta inteira) do tenant autenticado
export async function DELETE(request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { pauta, post } = await ctx.params;
  const pautaInteira = new URL(request.url).searchParams.get("pauta") === "1";
  try {
    return Response.json(await excluirPost(pauta, post, { pautaInteira }, sessao.tenantId));
  } catch (err) {
    const msg = (err as Error).message;
    return Response.json({ error: msg }, { status: msg === "Post não encontrado" ? 404 : 500 });
  }
}

// GET devolve o Post completo do tenant autenticado
export async function GET(_req: Request, ctx: Ctx) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const { pauta, post } = await ctx.params;
  const completo = await lerPost(pauta, post, sessao.tenantId);
  if (!completo) return Response.json({ error: "Post não encontrado" }, { status: 404 });
  return Response.json(completo);
}

async function handleUpdatePost(request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { pauta, post } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as AtualizacaoPost;
  const mudancas: AtualizacaoPost = {};
  if (typeof body.status === "string") mudancas.status = body.status;
  if (body.dataPlanejada === null || typeof body.dataPlanejada === "string") {
    mudancas.dataPlanejada = body.dataPlanejada;
  }
  if (typeof body.roteiro === "string") mudancas.roteiro = body.roteiro;
  if (typeof body.legenda === "string") mudancas.legenda = body.legenda;
  if (body.link === null || typeof body.link === "string") mudancas.link = body.link;
  if (Object.keys(mudancas).length === 0) {
    return Response.json({ error: "nada para atualizar" }, { status: 400 });
  }

  try {
    // Atualização manual zero-token: salva direto no PostgreSQL sem consumir créditos de IA
    await atualizarPost(pauta, post, mudancas, sessao.tenantId);
    return Response.json(await lerPost(pauta, post, sessao.tenantId));
  } catch (err) {
    const msg = (err as Error).message;
    return Response.json({ error: msg }, { status: msg === "Post não encontrado" ? 404 : 400 });
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  return handleUpdatePost(request, ctx);
}

export async function PUT(request: Request, ctx: Ctx) {
  return handleUpdatePost(request, ctx);
}
