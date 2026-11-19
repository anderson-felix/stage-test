import { exigirEditor } from "@/lib/auth";
import { extractCodeBlock, runClaude } from "@/lib/claude";
import { MIN_GENERATION_CREDITS, InsufficientCreditsError, formatInsufficientCreditsResponse } from "@/lib/credits";
import { atualizarCampanha, lerCampanha } from "@/lib/ads";
import { buildAnuncioGooglePrompt, carregarContextoMarcaTenant } from "@/lib/prompts";
import prisma from "@/lib/prisma";

function extractNamedBlocks(text: string): {
  estrategiaMd?: string;
  csvFiles: Record<string, string>;
} {
  const csvFiles: Record<string, string> = {};
  let estrategiaMd: string | undefined;

  const blockRegex = /```(?:csv|markdown|md)?\s*\r?\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(text)) !== null) {
    const content = match[1].trim();
    const firstLine = content.split(/\r?\n/)[0]?.trim() || "";
    const bodyWithoutMarker = content.split(/\r?\n/).slice(1).join("\n").trim();

    if (/estrategia\.md/i.test(firstLine)) {
      estrategiaMd = bodyWithoutMarker;
    } else {
      const fileMatch = /#\s*FILE:\s*([a-z0-9._-]+\.csv)/i.exec(firstLine);
      if (fileMatch?.[1]) {
        csvFiles[fileMatch[1].toLowerCase()] = bodyWithoutMarker;
      }
    }
  }
  return { estrategiaMd, csvFiles };
}

// POST { tarefa: "sementes" | "montar", language?, toneStyle?, referenceAssetId? }
export async function POST(request: Request, ctx: RouteContext<"/api/ads/campanhas/[slug]/montar">) {
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
  const c = await lerCampanha(slug, sessao.tenantId);
  if (!c) return Response.json({ error: "Campanha não encontrada" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    tarefa?: string;
    language?: string;
    toneStyle?: string;
    referenceAssetId?: string | null;
  };
  const { tarefa } = body;
  if (tarefa !== "sementes" && tarefa !== "montar") {
    return Response.json({ error: "tarefa inválida" }, { status: 400 });
  }
  if (tarefa === "montar" && !c.temPesquisa) {
    return Response.json(
      { error: "envie primeiro o CSV do Planejador de palavras-chave" },
      { status: 400 }
    );
  }

  const tenantId = sessao.tenantId;
  const rawCampRow = await prisma.adCampaign.findUnique({
    where: { tenantId_slug: { tenantId, slug } },
    select: { keywordResearchCsv: true },
  });

  // URL final real: LP vinculada (sempre do mesmo tenant) > URL manual da campanha
  const lpVinculada = c.landingPageId
    ? (c.landingPagesDisponiveis ?? []).find((l) => l.id === c.landingPageId)
    : undefined;
  const finalLpUrl = lpVinculada?.urlPublica || c.lpUrl;

  // Contexto da marca (BrandProfile real do tenant logado)
  const promptCtx = await carregarContextoMarcaTenant(tenantId, {
    language: body.language || c.language || "pt-BR",
    toneStyle: body.toneStyle || "Consultivo",
    briefing: c.corpo,
  });

  const systemPrompt = buildAnuncioGooglePrompt({
    ...promptCtx,
    tenantId,
    mode: tarefa,
    campaignTitle: c.titulo,
    campaignSlug: c.slug,
    serviceType: c.servico,
    dailyBudget: c.orcamentoDiario,
    targetRegion: c.regiao,
    lpUrl: finalLpUrl,
    keywordResearchCsv: rawCampRow?.keywordResearchCsv,
  });

  const message =
    tarefa === "sementes"
      ? `Gere os termos-semente de pesquisa para a Campanha "${c.titulo}".`
      : `Monte a campanha completa para Google Ads Editor ("${c.titulo}") com todos os CSVs e estratégia.`;

  return new Response(
    runClaude(message, undefined, request.signal, {
      tenantId: sessao.tenantId,
      userId: sessao.id,
      featureModule: `ads_${tarefa}`,
      systemPrompt,
      language: promptCtx.language,
      toneStyle: promptCtx.toneStyle,
      referenceAssetId: body.referenceAssetId ?? null,
      maxTokens: 12000,
      onCompletedText: async (fullText, emitTool) => {
        if (tarefa === "sementes") {
          const md = extractCodeBlock(fullText, "markdown") || fullText.trim();
          emitTool("Write", `${c.path}/pesquisa/sementes.md`);
          await atualizarCampanha(
            slug,
            { seedKeywordsMarkdown: md },
            sessao.tenantId
          );
        } else {
          const { estrategiaMd, csvFiles } = extractNamedBlocks(fullText);
          for (const fname of Object.keys(csvFiles)) {
            emitTool("Write", `${c.path}/ads-editor/${fname}`);
          }
          await atualizarCampanha(
            slug,
            {
              strategyMarkdown: estrategiaMd || c.corpo,
              csvFiles,
              status: Object.keys(csvFiles).length > 0 ? "pronta" : c.status,
            },
            sessao.tenantId
          );
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
