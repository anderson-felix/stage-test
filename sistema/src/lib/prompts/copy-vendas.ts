import { buildModoHubSystemPrompt, type PromptContextInput } from "./modo-hub";

export function buildCopyVendasPrompt(
  ctx: PromptContextInput & {
    format?: "email-prospeccao" | "sequencia-nutricao" | "mensagem-linkedin" | "proposta-executiva";
    targetAudience?: string;
  }
): string {
  return [
    buildModoHubSystemPrompt(ctx),
    "",
    "# SKILL: COPY DE VENDAS CONSULTIVA B2B",
    `Formato: ${ctx.format || "email-prospeccao"}`,
    `Público-alvo: ${ctx.targetAudience || "Decisores C-Level, Diretores e Heads em médias e grandes empresas"}`,
    "",
    "## REGRAS DE COPYWRITING EXECUTIVO",
    "1. Abordagem de par para par: escreva como um sócio/consultor sênior falando com outro executivo.",
    "2. Zero clichês de cold mail ('Espero que este e-mail o encontre bem', 'Gostaria de 15 minutinhos na sua agenda').",
    "3. Estrutura PAS Executiva: Problema concreto observado no setor -> Agitação (custo da inércia ou de pilotos travados) -> Solução com método claro -> Próximo passo de baixo atrito.",
    "4. Personalização modular: destaque entre colchetes `[Observação da Empresa]` onde o SDR/Sócio deve inserir contexto específico da conta.",
    "",
    "## BRIEFING",
    ctx.briefing?.trim() || "Escreva a copy comercial seguindo as diretrizes acima.",
  ].join("\n");
}

