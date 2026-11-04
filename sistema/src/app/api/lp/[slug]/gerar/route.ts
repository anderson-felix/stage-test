import { exigirEditor } from "@/lib/auth";
import { extractCodeBlock, runClaude } from "@/lib/claude";
import { MIN_GENERATION_CREDITS, InsufficientCreditsError, formatInsufficientCreditsResponse } from "@/lib/credits";
import { lerLP, salvarHtmlLP } from "@/lib/lp";
import { buildLandingPagePrompt, loadTenantPromptContext } from "@/lib/prompts";
import { analyzeLandingPageSeo } from "@/lib/seo-analyzer";
import prisma from "@/lib/prisma";

// POST { ajuste?, language?, toneStyle?, referenceAssetId? } gera (ou ajusta) a LP com o Prompt Builder /landing-page
export async function POST(request: Request, ctx: RouteContext<"/api/lp/[slug]/gerar">) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const tenant = await prisma.tenant.findUnique({
    where: { id: sessao.tenantId },
    select: { tokenCreditBalance: true },
  });
  if (!tenant || tenant.tokenCreditBalance < MIN_GENERATION_CREDITS) {
    return formatInsufficientCreditsResponse(
      new InsufficientCreditsError(tenant?.tokenCreditBalance ?? 0, MIN_GENERATION_CREDITS)
    );
  }

  const { slug } = await ctx.params;
  const lp = await lerLP(slug, sessao.tenantId);
  if (!lp) return Response.json({ error: "LP não encontrada" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    ajuste?: string;
    language?: string;
    toneStyle?: string;
    referenceAssetId?: string | null;
  };
  const pedido = body.ajuste?.trim().slice(0, 1500);
  if (pedido && !lp.versao) {
    return Response.json({ error: "gere a LP antes de pedir ajustes" }, { status: 400 });
  }

  // Busca o BrandProfile completo do tenant
  const brandProfile = await prisma.brandProfile.findUnique({
    where: { tenantId: sessao.tenantId },
  });

  const targetLang = body.language || lp.language || "pt-BR";
  const targetTone = body.toneStyle || lp.toneStyle || "Consultivo";

  // Identifica imagem de referência (do body ou pré-cadastrada no briefingData da LP)
  let refAssetId = body.referenceAssetId ?? lp.referenceAssetId ?? null;

  let refAsset = null;
  if (refAssetId) {
    refAsset = await prisma.mediaAsset.findFirst({
      where: { id: refAssetId, tenantId: sessao.tenantId },
    });
  }

  const promptCtx = await loadTenantPromptContext(sessao.tenantId, {
    language: targetLang,
    toneStyle: targetTone,
    briefing: lp.briefing,
  });

  const systemPrompt = buildLandingPagePrompt({
    ...promptCtx,
    brandProfile: brandProfile ?? null,
    lpTitle: lp.titulo,
    lpSlug: lp.slug,
    serviceType: lp.servico,
    purpose: lp.finalidade,
    adjustmentRequest: pedido,
    currentHtml: lp.draftHtml,
  });

  let userMessage = pedido
    ? `Aplique o seguinte ajuste ao HTML da Landing Page "${lp.titulo}":\n${pedido}`
    : `Gere o HTML completo da Landing Page "${lp.titulo}" seguindo todas as diretrizes do BrandProfile e design system.`;

  if (refAsset) {
    userMessage += `\n\n[Referência Visual Anexada]: O arquivo "${refAsset.fileName}" foi fornecido como referência de estilo, cores e layout para inspirar a composição da Landing Page.`;
  }

  return new Response(
    runClaude(userMessage, undefined, request.signal, {
      tenantId: sessao.tenantId,
      userId: sessao.id,
      featureModule: "landing_page_generator",
      systemPrompt,
      language: targetLang,
      toneStyle: targetTone,
      referenceAssetId: refAsset ? refAsset.id : null,
      maxTokens: 12000,
      onCompletedText: async (fullText, emitTool) => {
        const html = extractCodeBlock(fullText, "html");
        if (!html || !/<html/i.test(html)) {
          throw new Error("O modelo não retornou um documento HTML válido para a LP.");
        }
        emitTool("Write", `${lp.path}/index.html`);
        await salvarHtmlLP(slug, html, sessao.tenantId);

        // Executa análise de SEO automática e salva o relatório inicial
        try {
          const report = analyzeLandingPageSeo(html, { targetKeyword: lp.titulo });
          await prisma.landingPage.update({
            where: { tenantId_slug: { tenantId: sessao.tenantId, slug } },
            data: {
              seoMetadata: {
                title: report.extracted.title || lp.titulo,
                description: report.extracted.metaDescription || "",
                score: report.score,
                grade: report.grade,
                wordCount: report.wordCount,
                targetKeyword: lp.titulo,
                checklist: report.checklist,
                lastAnalyzedAt: new Date().toISOString(),
              },
            },
          });
        } catch {
          // Erro de análise não deve quebrar a geração principal da página
        }
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    }
  );
}
