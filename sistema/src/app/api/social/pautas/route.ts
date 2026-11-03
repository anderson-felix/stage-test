import { runClaude } from "@/lib/claude";
import { CANAIS, FORMATOS_POR_CANAL, novaPastaPauta, type Canal, type Formato } from "@/lib/social";

type Body = {
  tema?: string;
  angulo?: string;
  dataPlanejada?: string;
  posts?: { canal?: string; formato?: string }[];
};

// POST cria uma Pauta: reserva a pasta e pede à skill /roteiro os Posts (stream NDJSON de ChatEvent).
// A pasta criada volta no header X-Pauta-Path.
export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const tema = body.tema?.trim() ?? "";
  const angulo = body.angulo?.trim() ?? "";
  const data = body.dataPlanejada?.trim() || null;

  if (!tema || tema.length > 300) return Response.json({ error: "tema obrigatório (até 300 caracteres)" }, { status: 400 });
  if (angulo.length > 500) return Response.json({ error: "ângulo longo demais" }, { status: 400 });
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return Response.json({ error: "data inválida" }, { status: 400 });

  const pares = new Map<string, { canal: Canal; formato: Formato }>();
  for (const p of body.posts ?? []) {
    const canal = CANAIS.find((c) => c === p.canal);
    const formato = canal && FORMATOS_POR_CANAL[canal].find((f) => f === p.formato);
    if (!canal || !formato) {
      return Response.json({ error: `Canal/Formato inválido: ${p.canal}/${p.formato}` }, { status: 400 });
    }
    pares.set(`${canal}-${formato}`, { canal, formato });
  }
  if (pares.size === 0) return Response.json({ error: "escolha ao menos um Canal" }, { status: 400 });

  let pasta: string;
  try {
    pasta = await novaPastaPauta(data ?? new Date().toISOString().slice(0, 10), tema);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }

  const message = [
    "Use a skill roteiro, modo Criar, com esta entrada:",
    `- Pasta da Pauta: ${pasta}`,
    `- Tema: ${tema}`,
    `- Ângulo: ${angulo || "definir a partir da estratégia"}`,
    `- Data planejada: ${data ?? "sem data (deixar data_planejada vazio)"}`,
    `- Posts: ${[...pares.values()].map((p) => `${p.canal}/${p.formato}`).join(", ")}`,
  ].join("\n");

  return new Response(runClaude(message, undefined, request.signal), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Pauta-Path": encodeURIComponent(pasta),
    },
  });
}
