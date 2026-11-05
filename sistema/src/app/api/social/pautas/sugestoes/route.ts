import { exigirEditor } from "@/lib/auth";
import { collectClaude } from "@/lib/claude";
import { CANAIS, FORMATOS_POR_CANAL, listarPosts, SERIES } from "@/lib/social";
import { buildRoteiroPrompt, carregarContextoMarcaTenant } from "@/lib/prompts";

export type SugestaoPauta = {
  titulo: string;
  angulo: string;
  porque: string;
  serie: string;
  canais: { canal: string; formato: string }[];
};

function extrairSugestoes(text: string): SugestaoPauta[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  const raw = JSON.parse(text.slice(start, end + 1)) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (s): s is Record<string, unknown> =>
        !!s && typeof s === "object" && typeof s.titulo === "string"
    )
    .map((s) => ({
      titulo: String(s.titulo),
      angulo: typeof s.angulo === "string" ? s.angulo : "",
      porque: typeof s.porque === "string" ? s.porque : "",
      serie: SERIES.find((x) => x === s.serie) ?? "conteudo",
      canais: (Array.isArray(s.canais) ? s.canais : []).filter(
        (c): c is { canal: string; formato: string } =>
          !!c &&
          CANAIS.some((x) => x === c.canal) &&
          FORMATOS_POR_CANAL[c.canal as (typeof CANAIS)[number]].some(
            (f) => f === c.formato
          )
      ),
    }));
}

export async function POST(request: Request) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const tenantId = sessao.tenantId;
  const body = (await request.json().catch(() => ({}))) as { language?: string; toneStyle?: string };

  const indice = await listarPosts(tenantId);
  const existingTitles = Array.from(
    new Set(indice.posts.map((p) => p.pauta.titulo))
  );

  // Sugestões ancoradas estritamente no BrandProfile do tenant logado
  const promptCtx = await carregarContextoMarcaTenant(tenantId, {
    language: body.language,
    toneStyle: body.toneStyle,
    extraContext:
      "As sugestões devem derivar ESTRITAMENTE do nicho, público-alvo, serviços/produtos, diferenciais e regras de ouro descritos acima. Não sugira temas fora do escopo de negócio deste cliente.",
  });
  const systemPrompt = buildRoteiroPrompt({
    ...promptCtx,
    tenantId,
    mode: "sugerir",
    existingPautas: existingTitles,
  });

  const { text, error, status } = await collectClaude(
    "Sugira 5 Pautas inéditas em formato JSON array conforme especificado.",
    request.signal,
    {
      tenantId,
      userId: sessao.id,
      featureModule: "social_pauta_suggestions",
      systemPrompt,
      language: promptCtx.language,
      toneStyle: promptCtx.toneStyle,
      maxTokens: 3000,
    }
  );

  if (error) {
    return Response.json({ error }, { status: status ?? 502 });
  }

  try {
    const sugestoes = extrairSugestoes(text);
    if (sugestoes.length === 0) throw new Error("vazio");
    return Response.json({ sugestoes });
  } catch {
    return Response.json(
      { error: "O Claude não devolveu sugestões no formato esperado. Tente de novo." },
      { status: 502 }
    );
  }
}
