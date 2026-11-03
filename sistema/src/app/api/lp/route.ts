import { SERVICOS, type Servico } from "@/lib/ads";
import { FINALIDADES_LP, criarLP, listarLPs } from "@/lib/lp";

// GET lista as Landing Pages
export async function GET() {
  return Response.json({ lps: await listarLPs() });
}

// POST { titulo, servico, finalidade?, campanha?, briefing? } cria a pasta da LP (lp.md + logo.png)
export async function POST(request: Request) {
  const b = (await request.json()) as Record<string, unknown>;
  const titulo = typeof b.titulo === "string" ? b.titulo.trim() : "";
  const servico = SERVICOS.find((s) => s === b.servico);
  const finalidade = b.finalidade === undefined ? "campanha" : FINALIDADES_LP.find((f) => f === b.finalidade);
  if (!titulo || titulo.length > 120) return Response.json({ error: "nome da LP obrigatório (até 120 caracteres)" }, { status: 400 });
  if (!servico) return Response.json({ error: "escolha o serviço" }, { status: 400 });
  if (!finalidade) return Response.json({ error: "finalidade inválida" }, { status: 400 });
  try {
    const slug = await criarLP({
      titulo,
      servico: servico as Servico,
      finalidade,
      campanha: typeof b.campanha === "string" && b.campanha ? b.campanha : null,
      briefing: typeof b.briefing === "string" ? b.briefing.slice(0, 3000) : "",
    });
    return Response.json({ slug });
  } catch (err) {
    const msg = (err as Error).message;
    return Response.json({ error: msg }, { status: msg === "Campanha não encontrada" ? 400 : 500 });
  }
}
