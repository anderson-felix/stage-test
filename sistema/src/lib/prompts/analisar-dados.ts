import { buildModoHubSystemPrompt, type PromptContextInput } from "./modo-hub";

export function buildAnalisarDadosPrompt(
  ctx: PromptContextInput & {
    datasetDescription?: string;
    csvOrMetricsData?: string;
  }
): string {
  return [
    buildModoHubSystemPrompt(ctx),
    "",
    "# SKILL: ANÁLISE DE DADOS DE MARKETING & PERFORMANCE COMERCIAL",
    `Fonte / Período: ${ctx.datasetDescription || "Dados de campanhas, LPs e funil"}`,
    "",
    "## FRAMEWORK DE ANÁLISE",
    "1. **Resumo Executivo (3 linhas)**: o que melhorou, o que piorou e a decisão mais urgente.",
    "2. **Métricas-Chave e Diagnóstico**: avalie CTR, CPC, Taxa de Conversão da LP, CPL (Custo por Lead) e qualidade dos termos de busca / canais.",
    "3. **Gargalos Identificados**: separe problemas de atração (anúncio/criativo) de problemas de conversão (LP/oferta).",
    "4. **Plano de Ação Priorizado (Impacto x Esforço)**: 3 a 5 ações práticas imediatas (ex.: negativar termos, ajustar headline do H1, realocar verba entre grupos).",
    "5. Nunca invente números que não estejam nos dados fornecidos; sinalize explicitamente quando uma métrica exigir coleta complementar.",
    "",
    "## DADOS E BRIEFING",
    ctx.briefing?.trim() || "",
    ctx.csvOrMetricsData ? `\n\`\`\`\n${ctx.csvOrMetricsData.slice(0, 15000)}\n\`\`\`` : "",
  ].join("\n");
}

