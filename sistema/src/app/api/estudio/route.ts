import { PautaStatus } from "@prisma/client";
import { exigirEditor, exigirSessao } from "@/lib/auth";
import { collectClaude, extractCodeBlock } from "@/lib/ai/claude";
import prisma from "@/lib/prisma";
import { renderSocialPostHtmlToBlobs } from "@/lib/render";
import { getPostMeta } from "@/lib/social";
import { listTenantAssets } from "@/lib/storage";

export type VideoScene = {
  timecode: string;
  speech: string;
  sceneDirection: string;
  onScreenText: string;
};

export type VideoScriptResult = {
  title: string;
  videoStyle: string;
  duration: string;
  hook3s: string;
  ctaFinal: string;
  caption: string;
  scenes: VideoScene[];
};

type BrandColors = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bgDark: string;
  bgLight: string;
  headingFont: string;
  bodyFont: string;
  companyName: string;
};

function extractBrandColors(
  tenantName: string,
  visualGuideJson: unknown
): BrandColors {
  const vg =
    visualGuideJson && typeof visualGuideJson === "object"
      ? (visualGuideJson as Record<string, unknown>)
      : {};
  return {
    primaryColor:
      typeof vg.primaryColor === "string" && vg.primaryColor.trim()
        ? vg.primaryColor.trim()
        : "#4C0DFF",
    secondaryColor:
      typeof vg.secondaryColor === "string" && vg.secondaryColor.trim()
        ? vg.secondaryColor.trim()
        : "#6D23F9",
    accentColor:
      typeof vg.accentColor === "string" && vg.accentColor.trim()
        ? vg.accentColor.trim()
        : "#4FFBE5",
    bgDark: "#120924",
    bgLight: "#F8F6FF",
    headingFont:
      typeof vg.headingFont === "string" && vg.headingFont.trim()
        ? vg.headingFont.trim()
        : "Plus Jakarta Sans",
    bodyFont:
      typeof vg.bodyFont === "string" && vg.bodyFont.trim()
        ? vg.bodyFont.trim()
        : "Inter",
    companyName: tenantName || "Stage Consulting",
  };
}

function buildTemplateMultiSlideHtml(
  templateId: string,
  toneStyle: string,
  brand: BrandColors,
  customTitle?: string
): { title: string; slidesCount: number; html: string; caption: string } {
  const isLight = toneStyle === "minimalista-light" || toneStyle === "editorial-moderno";
  const bgSlide =
    toneStyle === "minimalista-light"
      ? `#FFFFFF`
      : toneStyle === "editorial-moderno"
        ? brand.bgLight
        : toneStyle === "vibrante-tech"
          ? `linear-gradient(155deg, ${brand.primaryColor} 0%, #0D0628 65%, #070312 100%)`
          : `linear-gradient(160deg, #1E0B4B 0%, ${brand.bgDark} 60%, #090414 100%)`;

  const textColor = isLight ? "#14111F" : "#F6F3FF";
  const mutedColor = isLight ? "#5B546B" : "#C4B5FD";
  const cardBg = isLight ? "#F1ECF9" : "rgba(255,255,255,0.07)";
  const accent = isLight ? brand.primaryColor : brand.accentColor;

  let title = customTitle?.trim() || "";
  let slides: Array<{ badge: string; heading: string; body: string; footer?: string }> = [];
  let caption = "";

  switch (templateId) {
    case "pros-contras":
      title = title || "Comparativo Estratégico: Prós vs. Contras";
      caption = `${title}\n\nAnalisamos os dois lados da decisão para ajudar lideranças B2B a priorizarem com clareza.\n\nSalve este post para consultar na próxima reunião de diretoria.`;
      slides = [
        {
          badge: "COMPARATIVO EXECUTIVO",
          heading: title,
          body: "O que realmente muda no resultado operacional quando comparamos os dois modelos lado a lado.",
        },
        {
          badge: "LADO A · VANTAGENS",
          heading: "Prós da Abordagem Estruturada",
          body: "• Previsibilidade de receita e margem\n• Processos auditáveis e escaláveis\n• Menor dependência de heróis individuais",
        },
        {
          badge: "LADO B · RISCOS E CUSTOS",
          heading: "Contras da Execução Improvisada",
          body: "• Retrabalho constante entre áreas\n• CAC elevado e ciclo comercial longo\n• Desgaste da liderança em incêndios diários",
        },
        {
          badge: "VEREDITO PRÁTICO",
          heading: "Qual caminho escolher agora?",
          body: "Comece diagnosticando os 3 maiores gargalos de margem. Fale com a nossa equipe pelo link da bio.",
        },
      ];
      break;

    case "estudo-caso-b2b":
      title = title || "Estudo de Caso B2B: Transformação de Resultado";
      caption = `${title}\n\nVeja como estruturamos o diagnóstico, plano de ação e governança para destravar eficiência real.`;
      slides = [
        {
          badge: "ESTUDO DE CASO REAL",
          heading: title,
          body: "De operação reativa e margens pressionadas para crescimento previsível em 90 dias.",
        },
        {
          badge: "1. O CENÁRIO ANTES",
          heading: "Diagnóstico Inicial",
          body: "Falta de visibilidade financeira por linha de produto e desalinhamento entre marketing e vendas.",
        },
        {
          badge: "2. A INTERVENÇÃO",
          heading: "O que foi implementado",
          body: "Redesenho de processos críticos, metas claras por squad e rituais semanais de acompanhamento de indicadores.",
        },
        {
          badge: "3. O IMPACTO MENSURÁVEL",
          heading: "Resultados Alcançados",
          body: "+38% em conversão qualificada e redução de 25% no ciclo médio de fechamento comercial.",
        },
      ];
      break;

    case "mito-verdade":
      title = title || "Mito vs. Verdade na Gestão Empresarial";
      caption = `${title}\n\nDesmistificando crenças que custam caro para empresas em fase de escala.`;
      slides = [
        {
          badge: "MITO VS. VERDADE",
          heading: title,
          body: "3 crenças comuns no mercado que travam o crescimento saudável da sua empresa.",
        },
        {
          badge: "MITO #1",
          heading: "“Mais faturamento resolve qualquer problema de caixa”",
          body: "Crescimento sem margem de contribuição positiva apenas acelera o consumo de capital de giro.",
        },
        {
          badge: "VERDADE #1",
          heading: "Eficiência operacional precede a escala",
          body: "Ajustar precificação, custos diretos e retenção multiplica o lucro líquido muito antes de dobrar o volume.",
        },
        {
          badge: "PRÓXIMO PASSO",
          heading: "Quer auditar os indicadores do seu negócio?",
          body: "Envie uma mensagem direta ou acesse o diagnóstico executivo no nosso perfil.",
        },
      ];
      break;

    case "checklist-passo":
      title = title || "Checklist Passo a Passo de Execução";
      caption = `${title}\n\nUse este roteiro prático de 4 etapas para validar a maturidade da sua operação hoje mesmo.`;
      slides = [
        {
          badge: "CHECKLIST PRÁTICO",
          heading: title,
          body: "Um guia direto ao ponto para aplicar com seu time ainda nesta semana.",
        },
        {
          badge: "PASSO 01 & 02",
          heading: "Fundação e Clareza de Metas",
          body: "✓ Mapear indicadores norte (KPIs reais)\n✓ Definir responsáveis únicos por entrega crítica",
        },
        {
          badge: "PASSO 03 & 04",
          heading: "Ritmo e Correção de Rota",
          body: "✓ Revisão semanal de desvios de meta\n✓ Documentação de aprendizados e padronização",
        },
        {
          badge: "SALVE ESTE CHECKLIST",
          heading: "Compartilhe com os sócios e gestores",
          body: "Siga nosso perfil para receber frameworks práticos toda semana.",
        },
      ];
      break;

    case "piramide-cta":
    default:
      title = title || "Princípio da Pirâmide: Tese Executiva + Ação";
      caption = `${title}\n\nComece pela conclusão principal, sustente com dados objetivos e direcione a tomada de decisão.`;
      slides = [
        {
          badge: "PRINCÍPIO DA PIRÂMIDE",
          heading: title,
          body: "A conclusão executiva vem primeiro: clareza estratégica gera velocidade de implementação.",
        },
        {
          badge: "ARGUMENTO CENTRAL",
          heading: "Por que isso importa agora?",
          body: "Líderes não têm tempo para introduções longas. Apresente o impacto no negócio logo nos primeiros 5 segundos.",
        },
        {
          badge: "EVIDÊNCIA PRÁTICA",
          heading: "Dados que comprovam a tese",
          body: "Equipes que operam com comunicação estruturada reduzem em até 40% o tempo de aprovação de projetos.",
        },
        {
          badge: "CHAMADA PARA AÇÃO",
          heading: "Agende uma conversa estratégica",
          body: `Converse com os especialistas da ${brand.companyName} e estruture seu próximo ciclo de crescimento.`,
        },
      ];
      break;
  }

  const slidesHtml = slides
    .map(
      (s, i) => `
    <section class="slide" style="position:relative;width:1080px;height:1350px;background:${bgSlide};color:${textColor};overflow:hidden;box-sizing:border-box;">
      <div style="position:absolute;left:88px;top:84px;padding:10px 22px;border-radius:999px;background:${cardBg};border:1px solid ${accent};color:${accent};font-family:'${brand.headingFont}',sans-serif;font-size:22px;font-weight:700;letter-spacing:0.08em;">
        ${s.badge}
      </div>
      <div style="position:absolute;right:88px;top:92px;font-family:'${brand.bodyFont}',sans-serif;font-size:22px;font-weight:600;color:${mutedColor};">
        0${i + 1} / 0${slides.length}
      </div>
      <h1 style="position:absolute;left:88px;top:240px;width:904px;font-family:'${brand.headingFont}',sans-serif;font-size:68px;font-weight:800;line-height:1.12;color:${textColor};margin:0;">
        ${s.heading}
      </h1>
      <p style="position:absolute;left:88px;top:670px;width:904px;padding:44px;border-radius:28px;background:${cardBg};font-family:'${brand.bodyFont}',sans-serif;font-size:36px;font-weight:500;line-height:1.45;color:${mutedColor};white-space:pre-line;margin:0;">
        ${s.body}
      </p>
      <div style="position:absolute;left:88px;bottom:84px;font-family:'${brand.headingFont}',sans-serif;font-size:24px;font-weight:700;color:${accent};">
        ${brand.companyName}
      </div>
    </section>`
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { margin: 0; background: #0D0B14; font-family: '${brand.bodyFont}', sans-serif; }
  </style>
</head>
<body>
${slidesHtml}
</body>
</html>`;

  return { title, slidesCount: slides.length, html, caption };
}

function buildFallbackVideoScript(params: {
  topic: string;
  videoStyle: string;
  duration: string;
  companyName: string;
}): VideoScriptResult {
  const title = params.topic.trim() || `Roteiro ${params.videoStyle} (${params.duration})`;
  const isLong = params.duration === "90s+";
  const isMedium = params.duration === "60s";

  const scenes: VideoScene[] = [
    {
      timecode: "00:00 - 00:04",
      speech: `Você sabia que a maioria das operações perde margem exatamente em "${title}" sem perceber no DRE?`,
      sceneDirection: `Plano médio (enquadramento vertical 9:16), corte rápido com zoom-in suave nos primeiros 2 segundos (${params.videoStyle}).`,
      onScreenText: "O ERRO OCULTO QUE DRENA SUA MARGEM",
    },
    {
      timecode: "00:04 - 00:15",
      speech: `Quando olhamos para o dia a dia das empresas, o sintoma mais comum é tentar resolver processos quebrados apenas aumentando o esforço da equipe.`,
      sceneDirection: "Inserir B-Roll dinâmico de reunião executiva / dashboard de indicadores com transição limpa.",
      onScreenText: "ESFORÇO ≠ PROCESSO ESCALÁVEL",
    },
    {
      timecode: isMedium || isLong ? "00:15 - 00:35" : "00:15 - 00:24",
      speech: `Na metodologia da ${params.companyName}, nós atacamos a raiz em três frentes: diagnóstico de dados, desenho de rituais e metas claras por responsável.`,
      sceneDirection: "Retorno para o apresentador (câmera principal) gesticulando os 3 pilares com gráficos sutis aparecendo na tela.",
      onScreenText: "1. DADOS  2. RITUAIS  3. METAS CLARAS",
    },
  ];

  if (isMedium || isLong) {
    scenes.push({
      timecode: isLong ? "00:35 - 01:05" : "00:35 - 00:50",
      speech: `Em menos de um trimestre, essa mudança reduz o retrabalho operacional e libera os sócios para focarem nas decisões estratégicas de expansão.`,
      sceneDirection: "B-Roll comparativo Antes vs. Depois ou tela dividida mostrando evolução de eficiência.",
      onScreenText: "+PREVISIBILIDADE · MENOS INCÊNDIOS",
    });
  }

  scenes.push({
    timecode: isLong ? "01:05 - 01:25" : isMedium ? "00:50 - 01:00" : "00:24 - 00:30",
    speech: `Quer aplicar essa estrutura no seu negócio? Comente "DIAGNÓSTICO" aqui embaixo ou acesse o link na bio da ${params.companyName}.`,
    sceneDirection: "Plano fechado, tom seguro e consultivo, apontando discretamente para o CTA inferior.",
    onScreenText: 'COMENTE "DIAGNÓSTICO" OU ACESSE A BIO',
  });

  return {
    title,
    videoStyle: params.videoStyle,
    duration: params.duration,
    hook3s: scenes[0].speech,
    ctaFinal: scenes[scenes.length - 1].speech,
    caption: `${title}\n\nRoteiro técnico estruturado (${params.videoStyle} · ${params.duration}).\n\nComente DIAGNÓSTICO para conversar com os especialistas da ${params.companyName}.`,
    scenes,
  };
}

export async function GET() {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const [tenant, brandProfile, assets, recentPosts] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: sessao.tenantId },
      select: { id: true, name: true, slug: true, tokenCreditBalance: true },
    }),
    prisma.brandProfile.findUnique({
      where: { tenantId: sessao.tenantId },
    }),
    listTenantAssets(sessao.tenantId),
    prisma.socialPost.findMany({
      where: { tenantId: sessao.tenantId },
      include: { pauta: { select: { slug: true, title: true } } },
      orderBy: { updatedAt: "desc" },
      take: 12,
    }),
  ]);

  return Response.json({
    tenant,
    brandProfile,
    assets,
    recentPosts: recentPosts.map((p) => {
      const meta = getPostMeta(p.arteHistoryJson);
      const postSlug = meta.postSlug || `${p.platform}-${p.format}`;
      return {
        id: p.id,
        slug: postSlug,
        pautaSlug: p.pauta.slug,
        pautaTitle: p.pauta.title,
        title: p.pauta.title,
        channel: p.platform,
        format: p.format,
        serie: meta.serie || "conteudo",
        status: meta.legacyStatus || p.status,
        scheduledDate:
          meta.dataPlanejada || (p.scheduledAt ? p.scheduledAt.toISOString().slice(0, 10) : null),
        hasArte: Boolean(p.arteHtml && p.arteHtml.trim().length > 0),
        slidesBlobUrls: Array.isArray(p.slidesBlobUrls) ? (p.slidesBlobUrls as string[]) : [],
        updatedAt: p.updatedAt.toISOString(),
      };
    }),
  });
}

export async function POST(request: Request) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const body = (await request.json().catch(() => ({}))) as {
    action?: "use_template" | "generate_video_script" | "save_video_post";
    templateId?: string;
    toneStyle?: string;
    customTitle?: string;
    channel?: string;
    videoStyle?: string;
    duration?: string;
    topic?: string;
    script?: VideoScriptResult;
    scheduledDate?: string;
  };

  const [tenant, brandProfile] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: sessao.tenantId } }),
    prisma.brandProfile.findUnique({ where: { tenantId: sessao.tenantId } }),
  ]);

  const brand = extractBrandColors(
    tenant?.name || sessao.tenantName || "Stage Consulting",
    brandProfile?.visualGuideJson
  );

  const tenantId = sessao.tenantId;
  const userId = sessao.id;

  // Garantir pauta padrão do Estúdio no mês corrente
  const now = new Date();
  const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  async function createEstudioPauta(title: string) {
    const slug = `estudio-${yyyyMm}-${Date.now().toString(36)}`;
    return prisma.socialPauta.create({
      data: {
        tenantId,
        slug,
        title,
        scheduledDate: now,
        briefingMarkdown: `---\ntitulo: ${title}\nobjetivo: autoridade\n---\n\nPeça criada pelo Módulo Estúdio Stage.`,
        status: PautaStatus.DESIGN,
      },
    });
  }

  if (body.action === "use_template") {
    const templateId = body.templateId || "piramide-cta";
    const toneStyle = body.toneStyle || "sobrio-executivo";
    const built = buildTemplateMultiSlideHtml(
      templateId,
      toneStyle,
      brand,
      body.customTitle
    );

    const pauta = await createEstudioPauta(built.title);
    const platform = body.channel || "instagram";
    const postSlug = `${platform}-carrossel`;
    const dateStr = body.scheduledDate || now.toISOString().slice(0, 10);

    const created = await prisma.socialPost.create({
      data: {
        tenantId: sessao.tenantId,
        pautaId: pauta.id,
        platform,
        format: "carrossel",
        language: "pt-BR",
        toneStyle,
        scriptMarkdown: `## Estrutura do Template (${templateId})\n\n${built.caption}`,
        captionMarkdown: built.caption,
        arteHtml: built.html,
        slidesBlobUrls: [],
        scheduledAt: new Date(dateStr),
        status: PautaStatus.DESIGN,
        arteHistoryJson: {
          postSlug,
          serie: "conteudo",
          legacyStatus: "em-design",
          dataPlanejada: dateStr,
          origemArte: "ia",
          versao: 1,
          customImages: [],
          snapshots: [],
        },
      },
    });

    // Tenta renderizar os PNGs iniciais para o Azure Blob Storage
    try {
      await renderSocialPostHtmlToBlobs(
        sessao.tenantId,
        created.id,
        built.html,
        "carrossel"
      );
    } catch {
      // Se o browser headless não estiver disponível no ambiente, o editor HTML ainda abre normalmente
    }

    return Response.json({
      ok: true,
      pautaSlug: pauta.slug,
      postSlug,
      editorUrl: `/social/${pauta.slug}/${postSlug}/editor`,
      postUrl: `/social/${pauta.slug}/${postSlug}`,
    });
  }

  if (body.action === "generate_video_script") {
    const videoStyle = body.videoStyle || "Institucional Executivo";
    const duration = body.duration || "60s";
    const topic = (body.topic || "").trim();
    if (!topic) {
      return Response.json(
        { error: "Informe o tema ou briefing do vídeo para gerar o roteiro." },
        { status: 400 }
      );
    }

    const prompt = [
      `Você é um Diretor de Vídeo e Estrategista de Conteúdo B2B trabalhando para a marca "${brand.companyName}".`,
      `Gere um roteiro técnico de vídeo vertical (Reels / Shorts / LinkedIn Video) cena a cena.`,
      `Tema / Briefing: ${topic}`,
      `Estilo de Vídeo selecionado: ${videoStyle}`,
      `Duração alvo: ${duration}`,
      ``,
      `Retorne APENAS um bloco JSON válido (\`\`\`json ... \`\`\`) exatamente no formato:`,
      `{`,
      `  "title": "Título curto e magnético do vídeo",`,
      `  "videoStyle": "${videoStyle}",`,
      `  "duration": "${duration}",`,
      `  "hook3s": "Frase exata do gancho nos primeiros 3 segundos",`,
      `  "ctaFinal": "Chamada para ação final clara",`,
      `  "caption": "Legenda completa para publicação no Instagram/LinkedIn com hashtags",`,
      `  "scenes": [`,
      `    {`,
      `      "timecode": "00:00 - 00:05",`,
      `      "speech": "Texto exato para leitura no Teleprompter",`,
      `      "sceneDirection": "Direção de cena, enquadramento ou B-Roll sugerido",`,
      `      "onScreenText": "Legenda / Lettering de destaque na tela"`,
      `    }`,
      `  ]`,
      `}`,
    ].join("\n");

    let scriptResult: VideoScriptResult | null = null;
    let aiNotice: string | undefined;

    if (process.env.ANTHROPIC_API_KEY) {
      const { text, error, status } = await collectClaude(prompt, request.signal, {
        tenantId,
        userId,
        featureModule: "estudio_video_script",
        toneStyle: videoStyle,
      });

      if (error && status === 402) {
        return Response.json({ error }, { status: 402 });
      }

      if (text) {
        const rawJson = extractCodeBlock(text, "json") || text;
        try {
          const parsed = JSON.parse(rawJson) as Partial<VideoScriptResult>;
          if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
            scriptResult = {
              title: parsed.title || topic,
              videoStyle,
              duration,
              hook3s: parsed.hook3s || parsed.scenes[0]?.speech || "",
              ctaFinal:
                parsed.ctaFinal ||
                parsed.scenes[parsed.scenes.length - 1]?.speech ||
                "",
              caption: parsed.caption || topic,
              scenes: parsed.scenes.map((s, idx) => ({
                timecode: s.timecode || `Cena ${idx + 1}`,
                speech: s.speech || "",
                sceneDirection: s.sceneDirection || "",
                onScreenText: s.onScreenText || "",
              })),
            };
          }
        } catch {
          // fallback estruturado abaixo se o JSON vier malformado
        }
      }
    } else {
      aiNotice =
        "ANTHROPIC_API_KEY não configurada no ambiente local; roteiro técnico estruturado gerado com o template metodológico da marca (sem consumo de créditos).";
    }

    if (!scriptResult) {
      scriptResult = buildFallbackVideoScript({
        topic,
        videoStyle,
        duration,
        companyName: brand.companyName,
      });
    }

    return Response.json({
      ok: true,
      script: scriptResult,
      notice: aiNotice,
    });
  }

  if (body.action === "save_video_post") {
    const script = body.script;
    if (!script || !Array.isArray(script.scenes) || script.scenes.length === 0) {
      return Response.json(
        { error: "Roteiro inválido para salvar no calendário." },
        { status: 400 }
      );
    }

    const pauta = await createEstudioPauta(script.title || "Roteiro de Vídeo");
    const platform = body.channel || "instagram";
    const postSlug = `${platform}-story`;
    const dateStr = body.scheduledDate || now.toISOString().slice(0, 10);

    const slidesMarkdown = [
      `## Slide 1 — Gancho de 3 Segundos\n\n${script.hook3s}\n`,
      ...script.scenes.map(
        (s, idx) =>
          `## Slide ${idx + 2} — Cena ${idx + 1} (${s.timecode})\n\n- **Teleprompter (Fala):** ${s.speech}\n- **Direção / B-Roll:** ${s.sceneDirection}\n- **Texto na Tela (On-screen):** ${s.onScreenText}\n`
      ),
      `## Slide ${script.scenes.length + 2} — CTA Final\n\n${script.ctaFinal}`,
    ].join("\n");

    const scriptFull = `## Roteiro\n\n${slidesMarkdown}\n\n## Legenda\n\n${script.caption || ""}\n\n## Notas de produção\n\nEstilo: ${script.videoStyle} | Duração: ${script.duration}`;

    await prisma.socialPost.create({
      data: {
        tenantId: sessao.tenantId,
        pautaId: pauta.id,
        platform,
        format: "story",
        language: "pt-BR",
        toneStyle: script.videoStyle,
        scriptMarkdown: scriptFull,
        captionMarkdown: script.caption || "",
        scheduledAt: new Date(dateStr),
        status: PautaStatus.APPROVED,
        slidesBlobUrls: [],
        arteHistoryJson: {
          postSlug,
          serie: "socios",
          legacyStatus: "aprovado",
          dataPlanejada: dateStr,
          origemArte: null,
          versao: 0,
          customImages: [],
          snapshots: [],
        },
      },
    });

    return Response.json({
      ok: true,
      pautaSlug: pauta.slug,
      postSlug,
      postUrl: `/social/${pauta.slug}/${postSlug}`,
    });
  }

  return Response.json({ error: "Ação inválida" }, { status: 400 });
}
