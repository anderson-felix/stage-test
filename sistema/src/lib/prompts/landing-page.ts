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
    ctx.brandProfile?.visualGuideJson && typeof ctx.brandProfile.visualGuideJson === "object"
      ? (ctx.brandProfile.visualGuideJson as {
          colors?: Record<string, string>;
          fonts?: Record<string, string>;
        })
      : {};

  const bgPrimary = visualObj.colors?.backgroundPrimary || "#0A0A0A";
  const bgSecondary = visualObj.colors?.backgroundSecondary || "#141414";
  const accentPrimary = visualObj.colors?.accentPrimary || "#C9A84C";
  const textPrimary = visualObj.colors?.textPrimary || "#F5F5F0";
  const fontDisplay = visualObj.fonts?.display || "Cormorant Garamond";
  const fontSans = visualObj.fonts?.sans || "Plus Jakarta Sans";

  return [
    buildModoHubSystemPrompt(ctx),
    "",
    "# SKILL: LANDING PAGE DE ALTA CONVERSÃO (HTML AUTOCONTIDO)",
    `Título da LP: ${ctx.lpTitle}`,
    `Slug: /${ctx.lpSlug}`,
    `Serviço: ${ctx.serviceType}`,
    `Finalidade: ${
      ctx.purpose === "site"
        ? "Página editorial/institucional do site (com navegação de topo)"
        : "Landing Page focada 100% em conversão de mídia paga (sem menu de fuga, CTA único)"
    }`,
    "",
    "## ARQUITETURA E REGRAS VISUAIS",
    `1. Gere um documento HTML5 completo e autocontido (iniciando com \`<!DOCTYPE html>\` e terminando com \`</html>\`), com CSS no \`<head>\` e Google Fonts (\`${fontDisplay}\` e \`${fontSans}\`).`,
    `2. Paleta da marca: Fundo principal \`${bgPrimary}\`, Fundo de cards \`${bgSecondary}\`, Destaque/Acento \`${accentPrimary}\`, Texto principal \`${textPrimary}\`.`,
    "3. Use `logo.png` como `src` da imagem do logotipo no topo e no rodapé (o servidor embute a imagem automaticamente).",
    "4. Estrutura de seções recomendada:",
    "   - **Hero**: tag de serviço, headline forte orientada à transformação/dor real (H1 único), subtítulo executivo, CTA primário que rola suavemente para `#diagnostico`.",
    "   - **O Cenário Real (Dores)**: 3 a 4 sintomas concretos que o comprador reconhece na própria operação.",
    "   - **Abordagem / Como Fazemos**: etapas numeradas (01, 02, 03, 04) mostrando método ponta a ponta.",
    "   - **Entregáveis & Diferenciais**: cards objetivos com o que o cliente leva na prática.",
    "   - **Perguntas Frequentes (FAQ)**: 4 dúvidas reais de decisores usando `<details><summary>`.",
    "   - **Seção Final de Conversão (`#diagnostico`)**: formulário HTML (`<form id=\"lead-form\">`) com campos `nome`, `email`, `empresa`, `cargo`, `telefone` e `desafio`, mais botão `<button type=\"submit\">` com contraste perfeito.",
    "5. ANTI-SLOP: Proibido usar contagens falsas ('+500 clientes'), depoimentos inventados, gradientes roxo/azul genéricos ou clichês vazios.",
    "6. Inclua `<title>` (30–60 caracteres), `<meta name=\"description\">` (110–160 caracteres) e hierarquia semântica H1 -> H2 -> H3 impecável.",
    "",
    "## BRIEFING ESPECÍFICO DA LP",
    ctx.briefing?.trim() || "Criar a Landing Page completa alinhada ao serviço e ao posicionamento da marca.",
    ctx.currentHtml && ctx.adjustmentRequest
      ? `\n## HTML ATUAL DA LP (APLIQUE O AJUSTE PEDIDO MANTENDO A ESTRUTURA)\nAjuste solicitado: ${ctx.adjustmentRequest}\n\n\`\`\`html\n${ctx.currentHtml}\n\`\`\``
      : "",
    "",
    "FORMATO DE RESPOSTA OBRIGATÓRIO: Retorne o código HTML completo dentro de um bloco ```html ... ```.",
  ].join("\n");
}

