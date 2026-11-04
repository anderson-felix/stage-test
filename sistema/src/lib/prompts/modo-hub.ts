import type { BrandProfile, Tenant } from "@prisma/client";

export type OutputLanguage = "pt-BR" | "en-US" | "es-ES";
export type ToneStyleOption = "Formal" | "Consultivo" | "Provocativo" | "Educativo" | "Direto";

export type PromptContextInput = {
  tenantId?: string;
  tenantName: string;
  brandProfile: (BrandProfile & { tenant?: Tenant | null }) | BrandProfile | null;
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
    bp?.visualGuideJson && typeof bp.visualGuideJson === "object" && !Array.isArray(bp.visualGuideJson)
      ? (bp.visualGuideJson as Record<string, unknown>)
      : {};
  const glossaryObj =
    bp?.glossaryJson && typeof bp.glossaryJson === "object" && !Array.isArray(bp.glossaryJson)
      ? (bp.glossaryJson as Record<string, unknown>)
      : {};

  const colors = (visualObj.colors && typeof visualObj.colors === "object" ? visualObj.colors : {}) as Record<string, string>;
  const fonts = (visualObj.fonts && typeof visualObj.fonts === "object" ? visualObj.fonts : {}) as Record<string, string>;

  // Extrai informações do glossário estruturado se disponível
  const niche = typeof glossaryObj.niche === "string" ? glossaryObj.niche : typeof glossaryObj.nicho === "string" ? glossaryObj.nicho : null;
  const targetAudience = typeof glossaryObj.targetAudience === "string" ? glossaryObj.targetAudience : typeof glossaryObj.publicoAlvo === "string" ? glossaryObj.publicoAlvo : null;
  const services = typeof glossaryObj.servicesOffered === "string" ? glossaryObj.servicesOffered : typeof glossaryObj.servicos === "string" ? glossaryObj.servicos : null;
  const differentiators = typeof glossaryObj.differentiators === "string" ? glossaryObj.differentiators : typeof glossaryObj.diferenciais === "string" ? glossaryObj.diferenciais : null;
  const avoidWords = typeof glossaryObj.avoidWords === "string" ? glossaryObj.avoidWords : typeof glossaryObj.palavrasProibidas === "string" ? glossaryObj.palavrasProibidas : null;
  const goldenRules = typeof glossaryObj.goldenRules === "string" ? glossaryObj.goldenRules : typeof glossaryObj.regrasDeOuro === "string" ? glossaryObj.regrasDeOuro : null;

  const sections: string[] = [
    `# CONTEXTO ESTRATÉGICO DO CLIENTE (TENANT: ${ctx.tenantName})`,
    "",
    LANGUAGE_INSTRUCTIONS[langKey],
    TONE_STYLE_INSTRUCTIONS[toneKey],
    "",
    "## 1. Identificação da Marca & Posicionamento",
    `- Nome da Empresa: ${ctx.tenantName}`,
    bp?.websiteUrl ? `- Website Oficial: ${bp.websiteUrl}` : "",
    niche ? `- Nicho / Segmento: ${niche}` : "",
    targetAudience ? `- Público-Alvo / ICP: ${targetAudience}` : "",
    services ? `- Serviços / Produtos Oferecidos: ${services}` : "",
    differentiators ? `- Diferenciais Competitivos: ${differentiators}` : "",
    "",
    "## 2. Contexto de Negócio e Tese",
    bp?.businessContext?.trim() || `${ctx.tenantName} — Soluções corporativas e consultoria de alto impacto.`,
    "",
    "## 3. Tom de Voz da Marca",
    bp?.toneOfVoice?.trim() || "Consultivo, direto, inteligente, parceiro e orientado a resultados reais mensuráveis.",
    "",
    "## 4. Regras Inegociáveis & Palavras Proibidas",
    bp?.brandRules?.trim() ||
      "- Nunca prometer resultados irreais ou prazos milagrosos.\n- Evitar jargão vazio ('disruptivo', 'bala de prata', 'revolucionário').\n- Sempre finalizar com próximo passo claro e objetivo.",
  ];

  if (avoidWords) {
    sections.push(`- Termos a Evitar: ${avoidWords}`);
  }
  if (goldenRules) {
    sections.push(`- Regras de Ouro: ${goldenRules}`);
  }

  sections.push(
    "",
    "## 5. Foco Comercial Atual",
    bp?.currentFocus?.trim() || "Geração de demanda qualificada, autoridade executiva e conversão B2B.",
    "",
    "## 6. Diretrizes Visuais da Marca",
    `- Cores Principais: Fundo Principal \`${colors.backgroundPrimary || colors.background || "#0A0A0A"}\`, Superfície \`${colors.backgroundSecondary || colors.surface || "#141414"}\`, Acento \`${colors.accentPrimary || colors.primary || "#C9A84C"}\`, Texto \`${colors.textPrimary || colors.text || "#F5F5F0"}\``,
    `- Tipografia: Títulos \`${fonts.display || fonts.title || "Cormorant Garamond"}\`, Corpo \`${fonts.sans || fonts.body || "Plus Jakarta Sans"}\``,
    bp?.logoBlobUrl ? `- Logotipo da Marca: ${bp.logoBlobUrl}` : "- Logotipo da Marca: `logo.png` (embutido automaticamente)",
    typeof visualObj.rawGuiaVisual === "string" && visualObj.rawGuiaVisual.trim()
      ? `\n### Detalhes do Guia Visual:\n${visualObj.rawGuiaVisual.trim()}`
      : ""
  );

  if (typeof glossaryObj.rawMarkdown === "string" && glossaryObj.rawMarkdown.trim()) {
    sections.push("", "## 7. Glossário e Vocabulário Próprio", glossaryObj.rawMarkdown.trim());
  }

  if (ctx.extraContext?.trim()) {
    sections.push("", "## 8. Contexto Adicional do Workspace", ctx.extraContext.trim());
  }

  return sections.filter(Boolean).join("\n");
}

export function buildModoHubSystemPrompt(ctx: PromptContextInput): string {
  return [
    formatBrandContextBlock(ctx),
    "",
    "# MODO HUB — EXECUÇÃO DIRETA SEM PERGUNTAS",
    "Você está operando como o motor de IA integrado ao painel SaaS da plataforma Stage Hub.",
    "- NÃO faça perguntas intermediárias nem peça confirmação.",
    "- NÃO tente gravar arquivos no disco local nem utilize ferramentas de sistema de arquivos (como salvar em `cerebro/` ou diretórios locais).",
    "- O que não estiver explícito no briefing deve ser decidido com base no Contexto do Negócio, Tom de Voz, Regras e Guia Visual acima.",
    "- Entregue SEMPRE o resultado final completo (HTML puro ou Markdown/JSON estruturado), pronto para produção, respeitando rigorosamente o idioma e o formato solicitados.",
  ].join("\n");
}
