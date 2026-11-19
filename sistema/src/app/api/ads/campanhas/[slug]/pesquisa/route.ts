import { exigirEditor } from "@/lib/auth";
import { lerCampanha, salvarPesquisa } from "@/lib/ads";
import { buildAnuncioGooglePrompt, loadTenantPromptContext } from "@/lib/prompts";

const MAX_BYTES = 10 * 1024 * 1024;

// PUT (multipart, campo "arquivo") recebe o export do Planejador de palavras-chave (CSV/TSV) ou uma lista simples
export async function PUT(request: Request, ctx: RouteContext<"/api/ads/campanhas/[slug]/pesquisa">) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { slug } = await ctx.params;
  const form = await request.formData();
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return Response.json({ error: "envie o arquivo do Planejador" }, { status: 400 });
  }
  if (arquivo.size > MAX_BYTES) return Response.json({ error: "arquivo maior que 10 MB" }, { status: 400 });
  if (!/\.(csv|tsv|txt)$/i.test(arquivo.name)) {
    return Response.json({ error: "use o CSV exportado do Planejador" }, { status: 400 });
  }

  try {
    const total = await salvarPesquisa(
      slug,
      new Uint8Array(await arquivo.arrayBuffer()),
      arquivo.name,
      sessao.tenantId
    );
    return Response.json({ total, campanha: await lerCampanha(slug, sessao.tenantId) });
  } catch (err) {
    const msg = (err as Error).message;
    return Response.json({ error: msg }, { status: msg === "Campanha não encontrada" ? 404 : 400 });
  }
}

// POST gera sugestão de palavras-chave semente para a campanha
export async function POST(_request: Request, ctx: RouteContext<"/api/ads/campanhas/[slug]/pesquisa">) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { slug } = await ctx.params;
  const c = await lerCampanha(slug, sessao.tenantId);
  if (!c) return Response.json({ error: "Campanha não encontrada" }, { status: 404 });

  const promptCtx = await loadTenantPromptContext(sessao.tenantId, {
    briefing: c.corpo,
  });

  const prompt = buildAnuncioGooglePrompt({
    ...promptCtx,
    mode: "sementes",
    campaignTitle: c.titulo,
    campaignSlug: c.slug,
    serviceType: c.servico,
    dailyBudget: c.orcamentoDiario,
    targetRegion: c.regiao,
    lpUrl: c.lpUrl,
  });

  return Response.json({ prompt, campanha: c });
}
