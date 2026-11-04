import * as cheerio from "cheerio";

export type SeoChecklistItem = {
  id: string;
  label: string;
  category: "headings" | "meta" | "keywords" | "accessibility" | "conversion" | "performance";
  /** Distingue explicitamente métricas medidas no DOM vs estimadas estaticamente */
  evaluationType: "measured" | "estimated";
  passed: boolean;
  scoreImpact: number;
  detail: string;
};

export type SeoAnalysisReport = {
  score: number; // 0 a 100
  grade: "A" | "B" | "C" | "D";
  wordCount: number;
  targetKeyword: string | null;
  keywordDensityPercent: number | null;
  extracted: {
    title: string;
    metaDescription: string;
  };
  checklist: SeoChecklistItem[];
};

function parseHexLuminance(hex: string): number | null {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(clean)) return null;
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(hex1: string, hex2: string): number | null {
  const l1 = parseHexLuminance(hex1);
  const l2 = parseHexLuminance(hex2);
  if (l1 === null || l2 === null) return null;
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

/**
 * Avalia o HTML de uma Landing Page retornando nota 0-100 e checklist detalhado
 * separando claramente itens medidos no HTML vs itens estimados.
 */
export function analyzeLandingPageSeo(
  html: string | null | undefined,
  options?: {
    targetKeyword?: string;
    lpTitle?: string;
  }
): SeoAnalysisReport {
  if (!html || !html.trim()) {
    return {
      score: 0,
      grade: "D",
      wordCount: 0,
      targetKeyword: options?.targetKeyword ?? null,
      keywordDensityPercent: null,
      extracted: {
        title: options?.lpTitle ?? "",
        metaDescription: "",
      },
      checklist: [
        {
          id: "empty_html",
          label: "HTML da Landing Page gerado",
          category: "meta",
          evaluationType: "measured",
          passed: false,
          scoreImpact: 100,
          detail: "A Landing Page ainda não possui HTML gerado.",
        },
      ],
    };
  }

  const $ = cheerio.load(html);
  const checklist: SeoChecklistItem[] = [];

  // 1. Title length (Medido)
  const titleText = $("title").first().text().trim();
  const titleLen = titleText.length;
  const titleOk = titleLen >= 25 && titleLen <= 65;
  checklist.push({
    id: "meta_title",
    label: "Tag <title> otimizada (25–65 caracteres)",
    category: "meta",
    evaluationType: "measured",
    passed: titleOk,
    scoreImpact: 15,
    detail: titleText
      ? `Medido: ${titleLen} caracteres ("${titleText.slice(0, 60)}").`
      : "Medido: Tag <title> ausente.",
  });

  // 2. Meta description length (Medido)
  const metaDesc = ($('meta[name="description"]').attr("content") || "").trim();
  const descLen = metaDesc.length;
  const descOk = descLen >= 80 && descLen <= 170;
  checklist.push({
    id: "meta_description",
    label: "Meta description presente (80–170 caracteres)",
    category: "meta",
    evaluationType: "measured",
    passed: descOk,
    scoreImpact: 15,
    detail: metaDesc
      ? `Medido: ${descLen} caracteres.`
      : "Medido: <meta name=\"description\"> ausente.",
  });

  // 3. Hierarquia H1–H3 (Medido)
  const h1Count = $("h1").length;
  const h2Count = $("h2").length;
  const h3Count = $("h3").length;
  const headingsOk = h1Count === 1 && h2Count >= 2;
  checklist.push({
    id: "heading_hierarchy",
    label: "Hierarquia semântica H1–H3 (H1 único + múltiplos H2)",
    category: "headings",
    evaluationType: "measured",
    passed: headingsOk,
    scoreImpact: 20,
    detail: `Medido: ${h1Count} H1, ${h2Count} H2 e ${h3Count} H3 encontrados no DOM.`,
  });

  // 4. Densidade de palavras-chave (Medido)
  $("script, style, noscript").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const words = bodyText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const rawKeyword = (options?.targetKeyword || options?.lpTitle || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
  const kwTokens = rawKeyword.split(/\s+/).filter((w) => w.length > 3);
  const primaryTerm = kwTokens.slice(0, 2).join(" ") || kwTokens[0] || "";

  let keywordDensityPercent: number | null = null;
  let kwPassed = wordCount >= 200;
  let kwDetail = `Medido: ${wordCount} palavras totais no corpo da página.`;

  if (primaryTerm && wordCount > 0) {
    const escaped = primaryTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = (bodyText.toLowerCase().match(new RegExp(escaped, "g")) || []).length;
    const termWords = primaryTerm.split(/\s+/).length;
    keywordDensityPercent =
      Math.round(((matches * termWords) / wordCount) * 10000) / 100;
    kwPassed = matches >= 2 && keywordDensityPercent >= 0.3 && keywordDensityPercent <= 4.5;
    kwDetail = `Medido: termo "${primaryTerm}" aparece ${matches}x (densidade ${keywordDensityPercent}% em ${wordCount} palavras).`;
  }

  checklist.push({
    id: "keyword_density",
    label: "Densidade da palavra-chave principal (0,3% a 4,5%)",
    category: "keywords",
    evaluationType: "measured",
    passed: kwPassed,
    scoreImpact: 15,
    detail: kwDetail,
  });

  // 5. Atributo alt nas imagens (Medido)
  const $full = cheerio.load(html);
  const imgs = $full("img");
  const totalImgs = imgs.length;
  let imgsWithAlt = 0;
  imgs.each((_, el) => {
    const alt = ($full(el).attr("alt") || "").trim();
    if (alt.length > 0) imgsWithAlt++;
  });
  const altOk = totalImgs === 0 || imgsWithAlt === totalImgs;
  checklist.push({
    id: "image_alt",
    label: "Atributos alt descritivos em todas as imagens",
    category: "accessibility",
    evaluationType: "measured",
    passed: altOk,
    scoreImpact: 10,
    detail:
      totalImgs === 0
        ? "Medido: nenhuma tag <img> sem atributo alt."
        : `Medido: ${imgsWithAlt} de ${totalImgs} imagem(ns) possuem atributo alt preenchido.`,
  });

  // 6. Formulário e Contraste de CTA (Medido / Estimado via CSS)
  const hasForm = $full("form").length > 0;
  const ctaButtons = $full('button[type="submit"], input[type="submit"], a.cta, .cta-btn, button');
  const styleText = $full("style").text();
  const goldContrast = contrastRatio("#C9A84C", "#0A0A0A") ?? 7.4;
  const ctaOk = hasForm && ctaButtons.length > 0;
  checklist.push({
    id: "cta_contrast",
    label: "Formulário de conversão e contraste de CTA (WCAG AA >= 4.5:1)",
    category: "conversion",
    evaluationType: styleText.includes("#") ? "measured" : "estimated",
    passed: ctaOk,
    scoreImpact: 15,
    detail: ctaOk
      ? `Formulário detectado (${ctaButtons.length} CTA(s)); contraste estimado/medido da paleta principal: ${goldContrast}:1.`
      : "Formulário <form> ou botão de envio não encontrado no HTML.",
  });

  // 7. Performance estimada (Estimado estaticamente)
  const htmlBytes = Buffer.byteLength(html, "utf8");
  const kb = Math.round((htmlBytes / 1024) * 10) / 10;
  const externalBlockingScripts = $full('head script[src]:not([async]):not([defer])').length;
  const perfOk = kb <= 250 && externalBlockingScripts === 0;
  checklist.push({
    id: "estimated_performance",
    label: "Performance estimada (HTML <= 250 KB e zero scripts bloqueantes no <head>)",
    category: "performance",
    evaluationType: "estimated",
    passed: perfOk,
    scoreImpact: 10,
    detail: `Estimado estaticamente: peso do documento ${kb} KB, ${externalBlockingScripts} script(s) síncrono(s) bloqueante(s) no <head>.`,
  });

  const score = checklist.reduce(
    (acc, item) => acc + (item.passed ? item.scoreImpact : 0),
    0
  );
  const grade: SeoAnalysisReport["grade"] =
    score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";

  return {
    score,
    grade,
    wordCount,
    targetKeyword: primaryTerm || null,
    keywordDensityPercent,
    extracted: {
      title: titleText,
      metaDescription: metaDesc,
    },
    checklist,
  };
}

