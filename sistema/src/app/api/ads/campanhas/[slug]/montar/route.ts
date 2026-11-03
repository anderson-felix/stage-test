import { runClaude } from "@/lib/claude";
import { lerCampanha } from "@/lib/ads";

// POST { tarefa: "sementes" | "montar" } chama a skill /anuncio-google (Modo Hub); stream NDJSON de ChatEvent
export async function POST(request: Request, ctx: RouteContext<"/api/ads/campanhas/[slug]/montar">) {
  const { slug } = await ctx.params;
  const c = await lerCampanha(slug);
  if (!c) return Response.json({ error: "Campanha não encontrada" }, { status: 404 });

  const { tarefa } = (await request.json().catch(() => ({}))) as { tarefa?: string };
  if (tarefa !== "sementes" && tarefa !== "montar") return Response.json({ error: "tarefa inválida" }, { status: 400 });
  if (tarefa === "montar" && !c.temPesquisa) {
    return Response.json({ error: "envie primeiro o CSV do Planejador de palavras-chave" }, { status: 400 });
  }

  const message =
    tarefa === "sementes"
      ? `Use a skill anuncio-google, Modo Hub, Tarefa A: gerar sementes para a Campanha em ${c.path}.`
      : `Use a skill anuncio-google, Modo Hub, Tarefa B: montar a campanha em ${c.path} a partir de ${c.path}/pesquisa/palavras-chave.csv.`;

  return new Response(runClaude(message, undefined, request.signal), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
