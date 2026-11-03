import { buildModoHubSystemPrompt, type PromptContextInput } from "./modo-hub";

export function buildAnuncioGooglePrompt(
  ctx: PromptContextInput & {
    mode: "sementes" | "montar";
    campaignTitle: string;
    campaignSlug: string;
    serviceType: string;
    dailyBudget: number | null;
    targetRegion: string;
    lpUrl: string;
    keywordResearchCsv?: string | null;
  }
): string {
  if (ctx.mode === "sementes") {
    return [
      buildModoHubSystemPrompt(ctx),
      "",
      "# SKILL: ANÚNCIO GOOGLE ADS — MODO 1: TERMOS PARA PESQUISAR (SEMENTES)",
      `Campanha: ${ctx.campaignTitle} (${ctx.serviceType})`,
      `Região: ${ctx.targetRegion}`,
      "",
      "## TAREFA",
      "Gere de 10 a 15 termos-semente de alta intenção comercial B2B (sem cauda longa excessiva, focados em quem busca contratar consultoria/implementação) para o usuário colar no Planejador de Palavras-Chave do Google Ads.",
      "",
      "## BRIEFING DA CAMPANHA",
      ctx.briefing?.trim() || "Gerar termos-semente alinhados ao serviço.",
      "",
      "FORMATO DE RESPOSTA OBRIGATÓRIO:",
      "Retorne um bloco ```markdown com a lista de termos (um por linha em bloco de código para fácil cópia) e uma breve explicação dos ângulos de intenção escolhidos.",
    ].join("\n");
  }

  return [
    buildModoHubSystemPrompt(ctx),
    "",
    "# SKILL: ANÚNCIO GOOGLE ADS — MODO 2: MONTAR CAMPANHA PARA GOOGLE ADS EDITOR",
    `Campanha: ${ctx.campaignTitle}`,
    `Serviço: ${ctx.serviceType}`,
    `Orçamento Diário: ${ctx.dailyBudget ? `R$ ${ctx.dailyBudget}` : "Em aberto"}`,
    `Região: ${ctx.targetRegion}`,
    `URL Final (LP): ${ctx.lpUrl || "https://stage.consulting/"}`,
    "",
    "## REGRAS DE ENGENHARIA GOOGLE ADS SEARCH",
    "1. Estruture de 3 a 5 Grupos de Anúncios temáticos coesos.",
    "2. Em cada Grupo, selecione palavras-chave em `Phrase` e `Exact` (nunca `Broad` puro sem controle).",
    "3. Gere lista robusta de palavras-chave negativas (`Negative Phrase` / `Negative Exact`) para bloquear buscas acadêmicas, vagas de emprego, cursos gratuitos, PDFs e ferramentas baratas.",
    "4. Crie 2 anúncios RSA (Responsive Search Ads) por Grupo, com 15 Headlines (MÁXIMO RIGOROSO de 30 caracteres cada!) e 4 Descriptions (MÁXIMO RIGOROSO de 90 caracteres cada!).",
    "5. Gere 4 extensões de Sitelinks relevantes.",
    "",
    "## BRIEFING E PESQUISA DE PALAVRAS-CHAVE",
    ctx.briefing?.trim() || "",
    ctx.keywordResearchCsv
      ? `\n### CSV de Pesquisa de Palavras-Chave:\n\`\`\`csv\n${ctx.keywordResearchCsv.slice(0, 12000)}\n\`\`\``
      : "\n(Sem CSV do Planejador: selecione os melhores termos de intenção de compra para o serviço).",
    "",
    "## FORMATO DE SAÍDA OBRIGATÓRIO (BLOCOS NOMEADOS)",
    "Você DEVE retornar exatamente os seguintes blocos de código identificados pelo comentário na primeira linha para que o sistema grave todos os arquivos:",
    "1. Bloco `\`\`\`markdown` iniciando com `<!-- FILE: estrategia.md -->` contendo `## Briefing`, `## Estratégia`, `## Antes de ativar` e `## Como importar`.",
    "2. Bloco `\`\`\`csv` iniciando com `# FILE: campanhas.csv` com cabeçalho: `Campaign,Campaign Type,Budget,Bid Strategy Type,Networks,Languages,Location,Campaign Status`",
    "3. Bloco `\`\`\`csv` iniciando com `# FILE: grupos.csv` com cabeçalho: `Campaign,Ad Group,Status`",
    "4. Bloco `\`\`\`csv` iniciando com `# FILE: keywords.csv` com cabeçalho: `Campaign,Ad Group,Keyword,Criterion Type,Status`",
    "5. Bloco `\`\`\`csv` iniciando com `# FILE: keywords-negativas.csv` com cabeçalho: `Campaign,Ad Group,Keyword,Criterion Type`",
    "6. Bloco `\`\`\`csv` iniciando com `# FILE: anuncios.csv` com cabeçalho: `Campaign,Ad Group,Ad Type,Headline 1,Headline 2,Headline 3,Headline 4,Headline 5,Headline 6,Headline 7,Headline 8,Headline 9,Headline 10,Headline 11,Headline 12,Headline 13,Headline 14,Headline 15,Description 1,Description 2,Description 3,Description 4,Final URL,Path 1,Path 2,Status`",
    "7. Bloco `\`\`\`csv` iniciando com `# FILE: extensoes-sitelinks.csv` com cabeçalho: `Campaign,Sitelink Text,Description Line 1,Description Line 2,Final URL`",
  ].join("\n");
}

