import { exigirEditor, exigirSessao } from "@/lib/auth";
import { limparHtmlArte, renderSocialPostHtmlToBlobs } from "@/lib/render";
import { atualizarPost, lerPost } from "@/lib/social";
import {
  resolverLogoDataUriTenant,
  resolverLogoUrlTenant,
  substituirReferenciasLogo,
} from "@/lib/brand-assets";

type Ctx = RouteContext<"/api/social/posts/[pauta]/[post]/arte/html">;

/** GET devolve o arteHtml atual do Post para o iframe do ArteEditor.tsx com a logo do Tenant resolvida. */
export async function GET(_request: Request, ctx: Ctx) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const { pauta, post } = await ctx.params;
  const atual = await lerPost(pauta, post, sessao.tenantId);
  if (!atual || !atual.arte.htmlContent) {
    return new Response("Arte HTML não encontrada", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const logoUrl = await resolverLogoUrlTenant(sessao.tenantId);
  const htmlComLogo = substituirReferenciasLogo(atual.arte.htmlContent, logoUrl);

  return new Response(htmlComLogo, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * PUT { html } grava o arteHtml vindo do Editor Visual Manual (`ArteEditor.tsx`) no SocialPost
 * (adicionando a versão anterior ao histórico `arteHistoryJson`), re-renderiza os PNGs via Playwright
 * para o Blob Storage e NÃO desconta créditos de IA.
 */
export async function PUT(request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { pauta, post } = await ctx.params;
  const atual = await lerPost(pauta, post, sessao.tenantId);
  if (!atual || !atual.id) {
    return Response.json({ error: "Post não encontrado" }, { status: 404 });
  }
  if (!atual.arte.html) {
    return Response.json(
      { error: "O Post não possui Arte HTML para editar" },
      { status: 400 }
    );
  }

  const { html } = (await request.json().catch(() => ({}))) as { html?: unknown };
  if (typeof html !== "string" || !html.trim()) {
    return Response.json({ error: "HTML vazio" }, { status: 400 });
  }

  try {
    const limpo = limparHtmlArte(html);
    if (!/class\s*=\s*["'][^"']*\bslide\b/.test(limpo)) {
      return Response.json(
        { error: "O HTML precisa conter ao menos um elemento .slide" },
        { status: 400 }
      );
    }

    const logoDataUri = await resolverLogoDataUriTenant(sessao.tenantId);
    const htmlParaRender = logoDataUri
      ? substituirReferenciasLogo(limpo, logoDataUri)
      : limpo;

    let slidesBlobUrls = atual.arte.slides;
    try {
      slidesBlobUrls = await renderSocialPostHtmlToBlobs(
        sessao.tenantId,
        atual.id,
        htmlParaRender,
        atual.formato
      );
    } catch {
      // Se Playwright não estiver disponível localmente, preserva os slides existentes e salva o HTML editado
    }

    await atualizarPost(
      pauta,
      post,
      {
        origemArte: "ia",
        arteHtml: limpo,
        slidesBlobUrls,
      },
      sessao.tenantId
    );
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
  return Response.json(await lerPost(pauta, post, sessao.tenantId));
}
