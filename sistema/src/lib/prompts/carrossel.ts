import { buildModoHubSystemPrompt, type PromptContextInput } from "./modo-hub";

export function buildCarrosselPrompt(
  ctx: PromptContextInput & {
    platform: "instagram" | "linkedin";
    format: "carrossel" | "post-unico" | "story";
    scriptMarkdown: string;
    adjustmentRequest?: string;
    currentArteHtml?: string | null;
  }
): string {
  const dimensions =
    ctx.format === "story"
      ? { width: 1080, height: 1920 }
      : { width: 1080, height: 1350 };

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
  const textSecondary = visualObj.colors?.textSecondary || "#A3A39E";
  const fontDisplay = visualObj.fonts?.display || "Cormorant Garamond";
  const fontSans = visualObj.fonts?.sans || "Plus Jakarta Sans";

  return [
    buildModoHubSystemPrompt(ctx),
    "",
    "# SKILL: DESIGN EDITORIAL DE SLIDES HTML/CSS (ARTE SOCIAL)",
    `Canal: ${ctx.platform.toUpperCase()} · Formato: ${ctx.format.toUpperCase()} (${dimensions.width}x${dimensions.height}px)`,
    "",
    "## REGRAS TÉCNICAS DO ARTE.HTML",
    `1. Gere um documento HTML5 completo e autocontido (\`<!DOCTYPE html>...</html>\`) onde CADA slide é uma \`<div class="slide">\` com exatamente \`width: ${dimensions.width}px; height: ${dimensions.height}px; overflow: hidden; position: relative; box-sizing: border-box;\`.`,
    `2. Carregue Google Fonts no \`<head>\`: \`${fontDisplay}\` (títulos editoriais) e \`${fontSans}\` (corpo e UI).`,
    `3. Paleta da Marca: Fundo escuro \`${bgPrimary}\`, Superfície \`${bgSecondary}\`, Acento dourado/marca \`${accentPrimary}\`, Texto principal \`${textPrimary}\`, Texto secundário \`${textSecondary}\` (varie com 1 ou 2 slides em fundo claro \`#F5F5F0\` e texto \`#0A0A0A\` para ritmo visual editorial).`,
    "4. Zona de segurança: padding mínimo de `84px` nas laterais e `96px` no topo/rodapé.",
    "5. Assinatura discreta no rodapé de cada slide com o nome da marca e paginação (`01 / 07`).",
    "6. Zero imagens externas quebradas; use tipografia expressiva, números grandes, linhas finas (`1px solid rgba(201,168,76,0.28)`), badges, grids e diagramas em CSS/SVG puro.",
    "7. Não inclua tags `<script>` no HTML final.",
    "",
    "## ROTEIRO DOS SLIDES A TRANSFORMAR EM ARTE.HTML",
    ctx.scriptMarkdown,
    ctx.currentArteHtml && ctx.adjustmentRequest
      ? `\n## ARTE.HTML ATUAL (APLIQUE O AJUSTE PEDIDO MANTENDO AS CLASSES .slide)\nAjuste solicitado: ${ctx.adjustmentRequest}\n\n\`\`\`html\n${ctx.currentArteHtml}\n\`\`\``
      : "",
    "",
    "FORMATO DE RESPOSTA OBRIGATÓRIO: Retorne o código HTML completo dentro de um bloco ```html ... ```.",
  ].join("\n");
}

