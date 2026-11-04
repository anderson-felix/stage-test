import { buildModoHubSystemPrompt, type PromptContextInput } from "./modo-hub";

export function buildSeoPrompt(
  ctx: PromptContextInput & {
    targetKeyword?: string;
    pageUrlOrSlug?: string;
    contentType?: "artigo" | "pagina-servico" | "auditoria";
  }
): string {
  return [
    buildModoHubSystemPrompt(ctx),
    "",
    "# SKILL: SEO ESTRATÉGICO B2B & CONTEÚDO ORGÂNICO",
    `Marca: ${ctx.tenantName}`,
    `Palavra-chave foco: ${ctx.targetKeyword || "Definir a partir do briefing"}`,
    `Tipo: ${ctx.contentType || "pagina-servico"}`,
    `Slug/URL: ${ctx.pageUrlOrSlug || ""}`,
    "",
    "## DIRETRIZES DE SEO ON-PAGE",
    "1. Intenção de busca: priorize intenção comercial e transacional B2B (decisores buscando diagnóstico, implementação ou consultoria especializada).",
    "2. Meta Title entre 30 e 60 caracteres com palavra-chave principal no início.",
    "3. Meta Description entre 120 e 155 caracteres com proposta de valor e chamada para ação.",
    "4. Hierarquia semântica rigorosa: apenas um `H1`, seções principais em `H2` cobrindo subtópicos semânticos (LSI) e detalhamentos em `H3`.",
    "5. Seção de FAQ estruturada respondendo às perguntas reais de compradores (otimizada para Featured Snippets e motores de resposta de IA / GEO).",
    "",
    "## BRIEFING",
    ctx.briefing?.trim() || `Produza a análise e o conteúdo otimizado para SEO para ${ctx.tenantName}.`,
  ].join("\n");
}
