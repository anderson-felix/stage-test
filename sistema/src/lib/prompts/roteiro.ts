import { buildModoHubSystemPrompt, type PromptContextInput } from "./modo-hub";
import type { Formato } from "../social";

export function buildRoteiroPrompt(
  ctx: PromptContextInput & {
    mode: "sugerir" | "criar";
    pautaPath?: string;
    theme?: string;
    angle?: string;
    plannedDate?: string | null;
    posts?: Array<{ canal: "instagram" | "linkedin"; formato: Formato }>;
    existingPautas?: string[];
  }
): string {
  if (ctx.mode === "sugerir") {
    return [
      buildModoHubSystemPrompt(ctx),
      "",
      "# SKILL: ROTEIRO EDITORIAL — MODO SUGERIR PAUTAS",
      `Marca: ${ctx.tenantName}`,
      "Sugira 5 ideias de Pautas inéditas e altamente relevantes para decisores B2B, conectadas ao Foco Comercial e ao Posicionamento da marca.",
      ctx.existingPautas && ctx.existingPautas.length > 0
        ? `\nPautas já existentes (NÃO repita estes temas):\n- ${ctx.existingPautas.join("\n- ")}`
        : "",
      "",
      "FORMATO DE RESPOSTA OBRIGATÓRIO:",
      "Retorne SOMENTE um array JSON válido (sem texto antes ou depois) no formato:",
      '`[{"titulo":"...","angulo":"...","porque":"...","serie":"conteudo","canais":[{"canal":"instagram","formato":"carrossel"},{"canal":"linkedin","formato":"post-unico"}]}]`',
      "Valores válidos para `serie`: `cultura-em-acao`, `dado`, `na-midia`, `socios`, `evento`, `conteudo`.",
    ].join("\n");
  }

  const postsList =
    ctx.posts?.map((p) => `${p.canal}-${p.formato}`).join(", ") ||
    "instagram-carrossel, linkedin-post-unico";

  return [
    buildModoHubSystemPrompt(ctx),
    "",
    "# SKILL: ROTEIRO EDITORIAL — MODO CRIAR PAUTA E POSTS",
    `Marca: ${ctx.tenantName}`,
    `Tema: ${ctx.theme || ""}`,
    `Ângulo: ${ctx.angle || "Definir tese executiva forte a partir do contexto da marca"}`,
    `Data Planejada: ${ctx.plannedDate || "Sem data fixa"}`,
    `Posts solicitados: ${postsList}`,
    "",
    "## REGRAS DE ROTEIRO E LEGENDA",
    "1. Para Carrossel (6 a 8 slides): Slide 1 (Capa com gancho/tese forte), Slides 2–6 (Desenvolvimento com 1 ideia central por slide, contraste antes/depois ou diagnóstico prático), Último Slide (Fechamento + CTA consultivo).",
    "2. Para Post Único (1 slide + legenda densa): Imagem síntese editorial e legenda estruturada com gancho na 1ª linha, desenvolvimento em tópicos escaneáveis e pergunta final para engajamento qualificado.",
    "3. Para Vídeo / Reels: Hook nos primeiros 3 segundos, desenvolvimento visual dinâmico com 3 tópicos e CTA falado direto para o link da bio.",
    "4. Série válida: escolha uma entre `conteudo`, `dado`, `cultura-em-acao`, `na-midia`, `socios`, `evento`.",
    "",
    "## FORMATO DE SAÍDA OBRIGATÓRIO (BLOCOS NOMEADOS)",
    "Para cada post solicitado (`<canal>-<formato>`), retorne dois blocos de código markdown identificados na primeira linha:",
    "1. `<!-- POST: <canal>-<formato> | SERIE: <serie> -->` seguido do Roteiro estruturado slide a slide (`## Slide 1 — Capa`, etc.) ou roteiro de cenas (`## Cena 1 — Gancho`, etc.).",
    "2. `<!-- LEGENDA: <canal>-<formato> -->` seguido do texto completo da legenda pronta para publicação (com hashtags estratégicas no final).",
  ].join("\n");
}
