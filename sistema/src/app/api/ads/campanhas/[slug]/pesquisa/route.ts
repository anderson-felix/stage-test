import { lerCampanha, salvarPesquisa } from "@/lib/ads";

const MAX_BYTES = 10 * 1024 * 1024;

// PUT (multipart, campo "arquivo") recebe o export do Planejador de palavras-chave (CSV/TSV) ou uma lista simples
export async function PUT(request: Request, ctx: RouteContext<"/api/ads/campanhas/[slug]/pesquisa">) {
  const { slug } = await ctx.params;
  const form = await request.formData();
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return Response.json({ error: "envie o arquivo do Planejador" }, { status: 400 });
  if (arquivo.size > MAX_BYTES) return Response.json({ error: "arquivo maior que 10 MB" }, { status: 400 });
  if (!/\.(csv|tsv|txt)$/i.test(arquivo.name)) return Response.json({ error: "use o CSV exportado do Planejador" }, { status: 400 });

  try {
    const total = await salvarPesquisa(slug, new Uint8Array(await arquivo.arrayBuffer()), arquivo.name);
    return Response.json({ total, campanha: await lerCampanha(slug) });
  } catch (err) {
    const msg = (err as Error).message;
    return Response.json({ error: msg }, { status: msg === "Campanha não encontrada" ? 404 : 400 });
  }
}
