import { collectClaude } from "@/lib/claude";
import { CANAIS, FORMATOS_POR_CANAL, SERIES } from "@/lib/social";

export type SugestaoPauta = {
  titulo: string;
  angulo: string;
  porque: string;
  serie: string;
  canais: { canal: string; formato: string }[];
};

/** Tira o array JSON da resposta, mesmo se vier com texto ou cerca de código em volta. */
function extrairSugestoes(text: string): SugestaoPauta[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  const raw = JSON.parse(text.slice(start, end + 1)) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && typeof s.titulo === "string")
    .map((s) => ({
      titulo: String(s.titulo),
      angulo: typeof s.angulo === "string" ? s.angulo : "",
      porque: typeof s.porque === "string" ? s.porque : "",
      serie: SERIES.find((x) => x === s.serie) ?? "conteudo",
      canais: (Array.isArray(s.canais) ? s.canais : []).filter(
        (c): c is { canal: string; formato: string } =>
          !!c &&
          CANAIS.some((x) => x === c.canal) &&
          FORMATOS_POR_CANAL[c.canal as (typeof CANAIS)[number]].some((f) => f === c.formato),
      ),
    }));
}

// POST pede à skill /roteiro (modo Sugerir) 5 Pautas alinhadas à estratégia.
export async function POST(request: Request) {
  const { text, error } = await collectClaude(
    "Use a skill roteiro, modo Sugerir. Responda somente o array JSON descrito na skill, sem texto em volta.",
    request.signal,
  );
  if (error) return Response.json({ error }, { status: 502 });
  try {
    const sugestoes = extrairSugestoes(text);
    if (sugestoes.length === 0) throw new Error("vazio");
    return Response.json({ sugestoes });
  } catch {
    return Response.json({ error: "O Claude não devolveu sugestões no formato esperado. Tente de novo." }, { status: 502 });
  }
}
