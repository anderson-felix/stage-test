import { buildModoHubSystemPrompt, type PromptContextInput } from "./modo-hub";
import type { Formato } from "../social";

export function buildCarrosselPrompt(
  ctx: PromptContextInput & {
    platform: "instagram" | "linkedin";
    format: Formato;
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
    "# SKILL: DESIGN EDITORIAL DE SLIDES HTML/CSS (ARTE SOCIAL)",
    `Marca / Tenant: ${ctx.tenantName}`,
    `Canal: ${ctx.platform.toUpperCase()} · Formato: ${ctx.format.toUpperCase()} (${dimensions.width}x${dimensions.height}px)`,
    "",
    "## REGRAS TÉCNICAS DO ARTE.HTML",
    `1. Gere um documento HTML5 completo e autocontido (\`<!DOCTYPE html>...</html>\`) onde CADA slide é uma \`<div class="slide">\` com exatamente \`width: ${dimensions.width}px; height: ${dimensions.height}px; overflow: hidden; position: relative; box-sizing: border-box;\`.`,
    `2. Carregue Google Fonts no \`<head>\`: \`${fontDisplay}\` (títulos editoriais) e \`${fontSans}\` (corpo e UI).`,
    `3. Paleta da Marca: Fundo escuro \`${bgPrimary}\`, Superfície \`${bgSecondary}\`, Acento da marca \`${accentPrimary}\`, Texto principal \`${textPrimary}\`, Texto secundário \`${textSecondary}\` (varie com 1 ou 2 slides em fundo claro \`#F5F5F0\` e texto \`#0A0A0A\` para ritmo visual editorial).`,
    "4. Zona de segurança: padding mínimo de `84px` nas laterais e `96px` no topo/rodapé.",
    `5. Assinatura discreta no rodapé de cada slide com o logotipo da marca (\`<img src="logo.png" alt="${ctx.tenantName}" style="height:44px;width:auto;">\` — o sistema substitui \`logo.png\` pela logo oficial do tenant) e paginação (\`01 / 07\`).`,
    `6. Zero imagens externas quebradas; use tipografia expressiva, números grandes, linhas finas (\`1px solid ${accentPrimary}40\`), badges, grids e diagramas em CSS/SVG puro.`,
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
