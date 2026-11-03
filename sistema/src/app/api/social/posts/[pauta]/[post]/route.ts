import { atualizarPost, excluirPost, lerPost, type AtualizacaoPost } from "@/lib/social";

// DELETE [?pauta=1] move o Post (ou a Pauta inteira) para marketing/social/_lixeira/
export async function DELETE(request: Request, ctx: RouteContext<"/api/social/posts/[pauta]/[post]">) {
  const { pauta, post } = await ctx.params;
  const pautaInteira = new URL(request.url).searchParams.get("pauta") === "1";
  try {
    return Response.json(await excluirPost(pauta, post, { pautaInteira }));
  } catch (err) {
    const msg = (err as Error).message;
    return Response.json({ error: msg }, { status: msg === "Post não encontrado" ? 404 : 500 });
  }
}

// GET devolve o Post completo: frontmatter, Roteiro, Legenda e Posts irmãos da Pauta
export async function GET(_req: Request, ctx: RouteContext<"/api/social/posts/[pauta]/[post]">) {
  const { pauta, post } = await ctx.params;
  const completo = await lerPost(pauta, post);
  if (!completo) return Response.json({ error: "Post não encontrado" }, { status: 404 });
  return Response.json(completo);
}

// PATCH { status?, dataPlanejada?, roteiro?, legenda?, link? } atualiza o Post
export async function PATCH(request: Request, ctx: RouteContext<"/api/social/posts/[pauta]/[post]">) {
  const { pauta, post } = await ctx.params;
  const body = (await request.json()) as AtualizacaoPost;
  const mudancas: AtualizacaoPost = {};
  if (typeof body.status === "string") mudancas.status = body.status;
  if (body.dataPlanejada === null || typeof body.dataPlanejada === "string") mudancas.dataPlanejada = body.dataPlanejada;
  if (typeof body.roteiro === "string") mudancas.roteiro = body.roteiro;
  if (typeof body.legenda === "string") mudancas.legenda = body.legenda;
  if (body.link === null || typeof body.link === "string") mudancas.link = body.link;
  if (Object.keys(mudancas).length === 0) return Response.json({ error: "nada para atualizar" }, { status: 400 });

  try {
    await atualizarPost(pauta, post, mudancas);
    return Response.json(await lerPost(pauta, post));
  } catch (err) {
    const msg = (err as Error).message;
    return Response.json({ error: msg }, { status: msg === "Post não encontrado" ? 404 : 400 });
  }
}
