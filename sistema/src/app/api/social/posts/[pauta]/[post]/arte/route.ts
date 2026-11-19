import { exigirEditor } from "@/lib/auth";
import { extractCodeBlock, runClaude } from "@/lib/claude";
import {
  MIN_GENERATION_CREDITS,
  InsufficientCreditsError,
  formatInsufficientCreditsResponse,
} from "@/lib/credits";
import { buildCarrosselPrompt, carregarContextoMarcaTenant } from "@/lib/prompts";
import { resolverLogoDataUriTenant, substituirReferenciasLogo } from "@/lib/brand-assets";
import prisma from "@/lib/prisma";
import { limparHtmlArte, renderSocialPostHtmlToBlobs } from "@/lib/render";
import { atualizarPost, lerPost } from "@/lib/social";
import { uploadTenantAsset } from "@/lib/storage";

type Ctx = RouteContext<"/api/social/posts/[pauta]/[post]/arte">;

export async function POST(request: Request, ctx: Ctx) {
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

  const { pauta, post } = await ctx.params;
  const atual = await lerPost(pauta, post, sessao.tenantId);
  if (!atual || !atual.id) return Response.json({ error: "Post não encontrado" }, { status: 404 });
  if (!atual.roteiro.trim()) {
    return Response.json({ error: "O Post ainda não possui Roteiro." }, { status: 400 });
  }
  if (atual.status === "rascunho") {
    return Response.json(
      {
        error:
          "Aprove o Roteiro primeiro (status 'Aprovado') antes de gerar a Arte com IA.",
      },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    ajuste?: string;
    language?: string;
    toneStyle?: string;
    referenceAssetId?: string | null;
  };
  const pedido = body.ajuste?.trim().slice(0, 1000);

  const tenantId = sessao.tenantId;
  // Contexto da marca do tenant logado (paleta visualGuideJson, fontes e logoBlobUrl)
  const promptCtx = await carregarContextoMarcaTenant(tenantId, {
    language: body.language,
    toneStyle: body.toneStyle || "Consultivo",
  });

  const systemPrompt = buildCarrosselPrompt({
    ...promptCtx,
    tenantId,
    platform: atual.canal,
    format: atual.formato,
    scriptMarkdown: atual.roteiro,
    adjustmentRequest: pedido,
    currentArteHtml: atual.arte.htmlContent,
  });

  const message = pedido
    ? `Aplique o seguinte ajuste ao arte.html do Post (${atual.canal} / ${atual.formato}):\n${pedido}`
    : `Gere o arte.html completo a partir do Roteiro aprovado para ${atual.canal} (${atual.formato}).`;

  return new Response(
    runClaude(message, undefined, request.signal, {
      tenantId: sessao.tenantId,
      userId: sessao.id,
      featureModule: "social_arte_generator",
      systemPrompt,
      language: promptCtx.language,
      toneStyle: promptCtx.toneStyle,
      referenceAssetId: body.referenceAssetId ?? null,
      maxTokens: 12000,
      onCompletedText: async (fullText, emitTool) => {
        const rawHtml = extractCodeBlock(fullText, "html");
        if (!rawHtml || !/class\s*=\s*["'][^"']*\bslide\b/i.test(rawHtml)) {
          throw new Error("A IA não gerou um arte.html válido contendo .slide");
        }
        const limpo = limparHtmlArte(rawHtml);
        emitTool("Write", `${atual.path}/arte/arte.html`);

        let slidesBlobUrls = atual.arte.slides;
        try {
          emitTool("Render", "renderizando os slides no Playwright e salvando no Blob Storage…");
          // Embute a logo real do tenant (data URI) apenas para a renderização headless
          const logoDataUri = await resolverLogoDataUriTenant(tenantId);
          const htmlRender = logoDataUri ? substituirReferenciasLogo(limpo, logoDataUri) : limpo;
          slidesBlobUrls = await renderSocialPostHtmlToBlobs(
            tenantId,
            atual.id!,
            htmlRender,
            atual.formato
          );
          emitTool("Render", `${slidesBlobUrls.length} slide(s) renderizados`);
        } catch {
          // Em ambientes sem binário de navegador local, preserva o arteHtml no banco
        }

        await atualizarPost(
          pauta,
          post,
          {
            origemArte: "ia",
            arteHtml: limpo,
            slidesBlobUrls,
            status: atual.status === "aprovado" ? "em-design" : atual.status,
          },
          sessao.tenantId
        );
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

const EXT_PERMITIDAS = new Set(["png", "jpg", "jpeg", "pdf"]);
const MAX_BYTES = 20 * 1024 * 1024;

export async function PUT(request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { pauta, post } = await ctx.params;
  const atual = await lerPost(pauta, post, sessao.tenantId);
  if (!atual || !atual.id) {
    return Response.json({ error: "Post não encontrado" }, { status: 404 });
  }

  const form = await request.formData();
  const arquivos = form
    .getAll("arquivos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (arquivos.length === 0) {
    return Response.json({ error: "nenhum arquivo enviado" }, { status: 400 });
  }
  for (const f of arquivos) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!EXT_PERMITIDAS.has(ext)) {
      return Response.json({ error: `tipo não aceito: ${f.name}` }, { status: 400 });
    }
    if (f.size > MAX_BYTES) {
      return Response.json(
        { error: `arquivo maior que 20 MB: ${f.name}` },
        { status: 400 }
      );
    }
  }
  if (arquivos.filter((f) => f.name.toLowerCase().endsWith(".pdf")).length > 1) {
    return Response.json({ error: "envie no máximo um PDF" }, { status: 400 });
  }

  const slidesBlobUrls: string[] = [];
  let pdfUrl: string | null = null;
  let n = 0;

  for (const f of arquivos) {
    const ext = f.name.split(".").pop()!.toLowerCase();
    const isPdf = ext === "pdf";
    const filename = isPdf
      ? `post-${atual.id}-arte.pdf`
      : `post-${atual.id}-slide-${String(++n).padStart(2, "0")}.${ext === "jpeg" ? "jpg" : ext}`;
    const mimeType = isPdf
      ? "application/pdf"
      : ext === "png"
        ? "image/png"
        : "image/jpeg";

    const buffer = Buffer.from(await f.arrayBuffer());
    const asset = await uploadTenantAsset({
      tenantId: sessao.tenantId,
      category: "social_slide",
      fileName: filename,
      mimeType,
      buffer,
    });

    const mediaUrl = `/api/media/${asset.id}`;
    if (isPdf) pdfUrl = mediaUrl;
    else slidesBlobUrls.push(mediaUrl);
  }

  await atualizarPost(
    pauta,
    post,
    {
      origemArte: "designer",
      slidesBlobUrls,
      pdfUrl,
      status: atual.status === "rascunho" || atual.status === "aprovado" ? "pronto" : atual.status,
    },
    sessao.tenantId
  );
  return Response.json(await lerPost(pauta, post, sessao.tenantId));
}
