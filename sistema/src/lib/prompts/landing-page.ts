import { buildModoHubSystemPrompt, type PromptContextInput } from "./modo-hub";

export function buildLandingPagePrompt(
  ctx: PromptContextInput & {
    lpTitle: string;
    lpSlug: string;
    serviceType: string;
    purpose: "campanha" | "site";
    adjustmentRequest?: string;
    currentHtml?: string | null;
  }
): string {
  const visualObj =
    ctx.brandProfile?.visualGuideJson && typeof ctx.brandProfile.visualGuideJson === "object" && !Array.isArray(ctx.brandProfile.visualGuideJson)
      ? (ctx.brandProfile.visualGuideJson as Record<string, unknown>)
      : {};

  const colors = (visualObj.colors && typeof visualObj.colors === "object" ? visualObj.colors : {}) as Record<string, string>;
  const fonts = (visualObj.fonts && typeof visualObj.fonts === "object" ? visualObj.fonts : {}) as Record<string, string>;

  const bgPrimary = colors.backgroundPrimary || colors.background || "#0A0A0A";
  const bgSecondary = colors.backgroundSecondary || colors.surface || "#141414";
  const accentPrimary = colors.accentPrimary || colors.primary || colors.accent || "#C9A84C";
  const textPrimary = colors.textPrimary || colors.text || "#F5F5F0";
  const textSecondary = colors.textSecondary || "#A3A39E";
  const fontDisplay = fonts.display || fonts.title || "Cormorant Garamond";
  const fontSans = fonts.sans || fonts.body || "Plus Jakarta Sans";

  return [
    buildModoHubSystemPrompt(ctx),
    "",
    "# SKILL: LANDING PAGE DE ALTA CONVERSÃO (HTML AUTOCONTIDO)",
    `Marca / Tenant: ${ctx.tenantName}`,
    `Título da LP: ${ctx.lpTitle}`,
    `Slug: /${ctx.lpSlug}`,
    `Serviço: ${ctx.serviceType}`,
    `Finalidade: ${
      ctx.purpose === "site"
        ? "Página editorial/institucional do site (com navegação de topo e múltiplos pontos de contato)"
        : "Landing Page focada 100% em conversão de tráfego pago (sem menu de fuga, CTA único para captura de lead)"
    }`,
    "",
    "## ARQUITETURA E REGRAS VISUAIS",
    `1. Gere um documento HTML5 completo e autocontido (iniciando com \`<!DOCTYPE html>\` e terminando com \`</html>\`), com CSS no \`<head>\` e Google Fonts (\`${fontDisplay}\` e \`${fontSans}\`).`,
    `2. Paleta da marca: Fundo principal \`${bgPrimary}\`, Fundo de cards/seções secundárias \`${bgSecondary}\`, Destaque/Acento \`${accentPrimary}\`, Texto principal \`${textPrimary}\`, Texto secundário \`${textSecondary}\`.`,
    "3. Use `logo.png` como `src` da imagem do logotipo no topo e no rodapé (o sistema embute o asset automaticamente).",
    "4. Estrutura de seções recomendada:",
    "   - **Hero**: tag de serviço, headline executiva forte orientada à transformação/dor real (H1 único), subtítulo executivo, CTA primário que rola suavemente para `#diagnostico`.",
    "   - **O Cenário Real (Dores)**: 3 a 4 sintomas concretos que o comprador reconhece na própria operação.",
    "   - **Abordagem / Como Fazemos**: etapas numeradas (01, 02, 03, 04) mostrando método ponta a ponta.",
    "   - **Entregáveis & Diferenciais**: cards objetivos com o que o cliente leva na prática.",
    "   - **Perguntas Frequentes (FAQ)**: 4 dúvidas reais de decisores usando `<details><summary>`.",
    "   - **Seção de Captura de Leads (`#diagnostico`)**:",
    "     OBRIGATÓRIO incluir um formulário HTML semântico com o atributo `data-stage-lead-form=\"true\"` e id `lead-form`:",
    "     ```html",
    "     <form data-stage-lead-form=\"true\" id=\"lead-form\" class=\"stage-lead-capture\">",
    "       <input type=\"text\" name=\"name\" id=\"lead-name\" required placeholder=\"Seu nome completo\" />",
    "       <input type=\"email\" name=\"email\" id=\"lead-email\" required placeholder=\"Seu melhor e-mail corporativo\" />",
    "       <input type=\"tel\" name=\"phone\" id=\"lead-phone\" placeholder=\"WhatsApp / Telefone com DDD\" />",
    "       <input type=\"text\" name=\"company\" id=\"lead-company\" placeholder=\"Nome da sua empresa\" />",
    "       <button type=\"submit\" class=\"cta-btn\">Quero Agendar Diagnóstico</button>",
    "     </form>",
    "     ```",
    "     (O sistema injeta automaticamente o script de captura para salvar o lead no CRM e disparar o e-mail de notificação).",
    "5. ANTI-SLOP: Proibido usar contagens falsas ('+500 clientes'), depoimentos inventados, gradientes roxo/azul genéricos ou clichês vazios.",
    "6. Inclua `<title>` (30–60 caracteres), `<meta name=\"description\">` (110–160 caracteres) e hierarquia semântica H1 -> H2 -> H3 impecável.",
    "",
    "## BRIEFING ESPECÍFICO DA LP",
    ctx.briefing?.trim() || `Criar a Landing Page completa para ${ctx.tenantName} alinhada ao serviço "${ctx.serviceType}".`,
    ctx.currentHtml && ctx.adjustmentRequest
      ? `\n## HTML ATUAL DA LP (APLIQUE O AJUSTE PEDIDO MANTENDO A ESTRUTURA)\nAjuste solicitado: ${ctx.adjustmentRequest}\n\n\`\`\`html\n${ctx.currentHtml}\n\`\`\``
      : "",
    "",
    "FORMATO DE RESPOSTA OBRIGATÓRIO: Retorne o código HTML completo dentro de um bloco ```html ... ```.",
  ].join("\n");
}
