import { criarCampanha, listarCampanhas, SERVICOS, type Servico } from "@/lib/ads";

// GET lista as Campanhas do workspace
export async function GET() {
  return Response.json({ campanhas: await listarCampanhas() });
}

// POST { titulo, servico, objetivo?, orcamentoDiario?, regiao?, briefing? } cria a pasta e o campanha.md
export async function POST(request: Request) {
  const b = (await request.json()) as Record<string, unknown>;
  const titulo = typeof b.titulo === "string" ? b.titulo.trim() : "";
  const servico = SERVICOS.find((s) => s === b.servico);
  const orcamento = b.orcamentoDiario === null || b.orcamentoDiario === undefined || b.orcamentoDiario === "" ? null : Number(b.orcamentoDiario);

  if (!titulo || titulo.length > 120) return Response.json({ error: "nome da Campanha obrigatório (até 120 caracteres)" }, { status: 400 });
  if (!servico) return Response.json({ error: "escolha o serviço" }, { status: 400 });
  if (orcamento !== null && (isNaN(orcamento) || orcamento < 0 || orcamento > 100000)) {
    return Response.json({ error: "orçamento diário inválido" }, { status: 400 });
  }

  try {
    const slug = await criarCampanha({
      titulo,
      servico: servico as Servico,
      objetivo: typeof b.objetivo === "string" ? b.objetivo.slice(0, 200) : "formulario",
      orcamentoDiario: orcamento,
      regiao: typeof b.regiao === "string" && b.regiao.trim() ? b.regiao.trim().slice(0, 80) : "Brazil",
      briefing: typeof b.briefing === "string" ? b.briefing.slice(0, 3000) : "",
    });
    return Response.json({ slug });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
