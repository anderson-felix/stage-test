import { exigirEditor } from "@/lib/auth";
import { atualizarPost, lerPost } from "@/lib/social";
import { limparHtmlArte, renderizarArte, salvarArteHtml } from "@/lib/render";

/** PUT { html } grava o arte.html vindo do Editor de Arte no PostgreSQL (sem consumir créditos de IA) e re-renderiza PNGs/PDF. */
export async function PUT(request: Request, ctx: RouteContext<"/api/social/posts/[pauta]/[post]/arte/html">) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { pauta, post } = await ctx.params;
  const atual = await lerPost(pauta, post, sessao.tenantId);
  if (!atual) return Response.json({ error: "Post não encontrado" }, { status: 404 });
  if (!atual.arte.html) return Response.json({ error: "o Post não tem Arte da IA para editar" }, { status: 400 });

  const { html } = (await request.json().catch(() => ({}))) as { html?: unknown };
  if (typeof html !== "string" || !html.trim()) {
    return Response.json({ error: "HTML vazio" }, { status: 400 });
  }

  try {
    const limpo = limparHtmlArte(html);
    if (!/class\s*=\s*["'][^"']*\bslide\b/.test(limpo)) {
      return Response.json({ error: "o HTML precisa ter ao menos um .slide" }, { status: 400 });
    }

    await salvarArteHtml(atual.path, limpo).catch(() => undefined);
    let slidesBlobUrls = atual.arte.slides;
    let pdfUrl = atual.arte.pdf;

    try {
      const r = await renderizarArte(atual.path, atual.canal, atual.formato);
      slidesBlobUrls = Array.from(
        { length: r.slides },
        (_, i) => `${atual.path}/arte/slide-${String(i + 1).padStart(2, "0")}.png`
      );
      pdfUrl = r.pdf ? `${atual.path}/arte/arte.pdf` : null;
    } catch {
      // Se Playwright não estiver disponível no ambiente atual, preserva o HTML salvo no banco
    }

    await atualizarPost(
      pauta,
      post,
      {
        origemArte: "ia",
        arteHtml: limpo,
        slidesBlobUrls,
        pdfUrl,
      },
      sessao.tenantId
    );
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
  return Response.json(await lerPost(pauta, post, sessao.tenantId));
}
