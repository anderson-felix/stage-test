import { runClaude } from "@/lib/claude";
import { lerLP } from "@/lib/lp";

// POST { ajuste? } gera (ou ajusta) a LP com a skill /landing-page; stream NDJSON de ChatEvent
export async function POST(request: Request, ctx: RouteContext<"/api/lp/[slug]/gerar">) {
  const { slug } = await ctx.params;
  const lp = await lerLP(slug);
  if (!lp) return Response.json({ error: "LP não encontrada" }, { status: 404 });

  const { ajuste } = (await request.json().catch(() => ({}))) as { ajuste?: string };
  const pedido = ajuste?.trim().slice(0, 1500);
  if (pedido && !lp.versao) return Response.json({ error: "gere a LP antes de pedir ajustes" }, { status: 400 });

  const message = [
    `Use a skill landing-page para a LP em ${lp.path}.`,
    `Leia ${lp.path}/lp.md e grave somente ${lp.path}/index.html.`,
    pedido ? `Ajuste pedido: ${pedido}` : "Gere a LP completa.",
  ].join("\n");

  return new Response(runClaude(message, undefined, request.signal), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
