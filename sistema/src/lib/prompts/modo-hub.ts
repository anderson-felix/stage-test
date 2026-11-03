import type { BrandProfile } from "@prisma/client";

export type OutputLanguage = "pt-BR" | "en-US" | "es-ES";
export type ToneStyleOption = "Formal" | "Consultivo" | "Provocativo" | "Educativo" | "Direto";

export type PromptContextInput = {
  tenantName: string;
  brandProfile: BrandProfile | null;
  language?: string;
  toneStyle?: string;
  briefing?: string;
  extraContext?: string;
};

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  "pt-BR":
    "IDIOMA DE SAÍDA OBRIGATÓRIO: Português do Brasil (pt-BR). Escreva com fluidez nativa, ortografia oficial brasileira e vocabulário executivo B2B.",
  "en-US":
    "MANDATORY OUTPUT LANGUAGE: American English (en-US). Write all headlines, copy, CTAs, and content in fluent, executive B2B American English.",
  "es-ES":
    "IDIOMA DE SALIDA OBLIGATORIO: Español (es-ES / Neutro corporativo). Escribe todos los títulos, textos, CTAs y contenido en español ejecutivo B2B.",
};

const TONE_STYLE_INSTRUCTIONS: Record<string, string> = {
  Formal:
    "ESTILO DE TOM (Formal): Institucional, sóbrio, rigoroso, vocabulário C-level clássico e postura de alta governança.",
  Consultivo:
    "ESTILO DE TOM (Consultivo): Parceiro estratégico sênior que diagnostica problemas reais, orienta decisões de negócio e demonstra método prático.",
  Provocativo:
    "ESTILO DE TOM (Provocativo): Desafia o senso comum do mercado, expõe gargalos ocultos com tese forte e tira o decisor da zona de conforto sem perder a elegância.",
  Educativo:
    "ESTILO DE TOM (Educativo): Didático, analítico e estruturado em frameworks claros, traduzindo complexidade técnica em clareza executiva.",
  Direto:
    "ESTILO DE TOM (Direto): Objetivo, frases curtas, foco imediato em dor, solução, entrega e conversão, zero rodeios.",
};

export function formatBrandContextBlock(ctx: PromptContextInput): string {
  const bp = ctx.brandProfile;
  const langKey = ctx.language && ctx.language in LANGUAGE_INSTRUCTIONS ? ctx.language : "pt-BR";
  const toneKey = ctx.toneStyle && ctx.toneStyle in TONE_STYLE_INSTRUCTIONS ? ctx.toneStyle : "Consultivo";

  const visualObj =
    bp?.visualGuideJson && typeof bp.visualGuideJson === "object"
      ? (bp.visualGuideJson as Record<string, unknown>)
      : {};
  const glossaryObj =
    bp?.glossaryJson && typeof bp.glossaryJson === "object"
      ? (bp.glossaryJson as Record<string, unknown>)
      : {};

  return [
    `# CONTEXTO ESTRATÉGICO DO CLIENTE (TENANT: ${ctx.tenantName})`,
    "",
    LANGUAGE_INSTRUCTIONS[langKey],
    TONE_STYLE_INSTRUCTIONS[toneKey],
    "",
    "## 1. Sobre o Negócio e Posicionamento",
    bp?.businessContext?.trim() || `${ctx.tenantName} — Consultoria e soluções empresariais.`,
    "",
    "## 2. Tom de Voz da Marca",
    bp?.toneOfVoice?.trim() || "Consultivo, direto, inteligente, parceiro e orientado a resultados reais.",
    "",
    "## 3. Regras Inegociáveis da Marca",
    bp?.brandRules?.trim() ||
      "- Nunca prometer resultados irreais ou prazos milagrosos.\n- Evitar jargão vazio ('disruptivo', 'bala de prata', 'revolucionário').\n- Sempre finalizar com próximo passo claro.",
    "",
    "## 4. Foco Comercial Atual",
    bp?.currentFocus?.trim() || "Geração de demanda qualificada e autoridade executiva.",
    "",
    "## 5. Glossário e Vocabulário",
    typeof glossaryObj.rawMarkdown === "string" && glossaryObj.rawMarkdown.trim()
      ? glossaryObj.rawMarkdown.trim()
      : JSON.stringify(glossaryObj, null, 2),
    "",
    "## 6. Diretrizes Visuais e Identidade",
    typeof visualObj.rawGuiaVisual === "string" && visualObj.rawGuiaVisual.trim()
      ? visualObj.rawGuiaVisual.trim()
      : JSON.stringify(visualObj, null, 2),
  ].join("\n");
}

export function buildModoHubSystemPrompt(ctx: PromptContextInput): string {
  return [
    formatBrandContextBlock(ctx),
    "",
    "# MODO HUB — EXECUÇÃO DIRETA SEM PERGUNTAS",
    "Você está operando como o motor de IA integrado ao painel SaaS da plataforma Stage Hub.",
    "- NÃO faça perguntas intermediárias nem peça confirmação.",
    "- O que não estiver explícito no briefing deve ser decidido com base no Contexto do Negócio, Tom de Voz, Regras e Guia Visual acima.",
    "- Entregue o resultado final completo, pronto para produção, respeitando rigorosamente o idioma e o formato solicitados.",
  ].join("\n");
}

