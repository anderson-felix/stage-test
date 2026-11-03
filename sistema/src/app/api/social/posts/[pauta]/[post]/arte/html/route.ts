import { atualizarPost, lerPost } from "@/lib/social";
import { renderizarArte, salvarArteHtml } from "@/lib/render";

/** PUT { html } grava o arte.html vindo do Editor de Arte e re-renderiza PNGs/PDF. */
export async function PUT(request: Request, ctx: RouteContext<"/api/social/posts/[pauta]/[post]/arte/html">) {
  const { pauta, post } = await ctx.params;
  const atual = await lerPost(pauta, post);
  if (!atual) return Response.json({ error: "Post não encontrado" }, { status: 404 });
  if (!atual.arte.html) return Response.json({ error: "o Post não tem Arte da IA para editar" }, { status: 400 });

  const { html } = (await request.json().catch(() => ({}))) as { html?: unknown };
  if (typeof html !== "string" || !html.trim()) return Response.json({ error: "HTML vazio" }, { status: 400 });

  try {
    await salvarArteHtml(atual.path, html);
    await renderizarArte(atual.path, atual.canal, atual.formato);
    await atualizarPost(pauta, post, { origemArte: "ia" });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
  return Response.json(await lerPost(pauta, post));
}
