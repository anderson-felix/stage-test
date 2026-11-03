import fs from "node:fs/promises";
import path from "node:path";
import { exigirEditor } from "@/lib/auth";
import { extractCodeBlock, runClaude } from "@/lib/claude";
import {
  MIN_GENERATION_CREDITS,
  InsufficientCreditsError,
  formatInsufficientCreditsResponse,
} from "@/lib/credits";
import { atualizarPost, caminhoPost, lerPost } from "@/lib/social";
import {
  arquivarArte,
  guardarHtmlNoHistorico,
  limparHtmlArte,
  renderizarArte,
  salvarArteHtml,
} from "@/lib/render";
import { buildCarrosselPrompt, loadTenantPromptContext } from "@/lib/prompts";
import prisma from "@/lib/prisma";
import { resolveSafe } from "@/lib/workspace";

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
  if (!atual) return Response.json({ error: "Post não encontrado" }, { status: 404 });
  if (!atual.roteiro.trim()) {
    return Response.json({ error: "o Post não tem Roteiro" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    ajuste?: string;
    language?: string;
    toneStyle?: string;
    referenceAssetId?: string | null;
  };
  const pedido = body.ajuste?.trim().slice(0, 1000);

  if (atual.arte.html) {
    await guardarHtmlNoHistorico(atual.path).catch(() => undefined);
  }

  const promptCtx = await loadTenantPromptContext(sessao.tenantId, {
    language: body.language || "pt-BR",
    toneStyle: body.toneStyle || "Consultivo",
  });

  const systemPrompt = buildCarrosselPrompt({
    ...promptCtx,
    platform: atual.canal,
    format: atual.formato,
    scriptMarkdown: atual.roteiro,
    adjustmentRequest: pedido,
    currentArteHtml: atual.arte.htmlContent,
  });

  const message = pedido
    ? `Aplique o seguinte ajuste ao arte.html do Post (${atual.canal} / ${atual.formato}):\n${pedido}`
    : `Gere o arte.html completo a partir do Roteiro para ${atual.canal} (${atual.formato}).`;

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
        await salvarArteHtml(atual.path, limpo).catch(() => undefined);

        let slidesBlobUrls = atual.arte.slides;
        let pdfUrl = atual.arte.pdf;

        try {
          emitTool("Render", "renderizando os slides…");
          const r = await renderizarArte(atual.path, atual.canal, atual.formato);
          slidesBlobUrls = Array.from(
            { length: r.slides },
            (_, i) => `${atual.path}/arte/slide-${String(i + 1).padStart(2, "0")}.png`
          );
          pdfUrl = r.pdf ? `${atual.path}/arte/arte.pdf` : null;
          emitTool("Render", `${r.slides} slide(s)${r.pdf ? " + PDF" : ""}`);
        } catch {
          // Se Playwright não puder rodar no ambiente, mantém o arteHtml salvo no banco
        }

        await atualizarPost(
          pauta,
          post,
          {
            origemArte: "ia",
            arteHtml: limpo,
            slidesBlobUrls,
            pdfUrl,
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
  let rel: string;
  try {
    rel = caminhoPost(pauta, post);
  } catch {
    return Response.json({ error: "Post não encontrado" }, { status: 404 });
  }
  if (!(await lerPost(pauta, post, sessao.tenantId))) {
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

  const arteDir = resolveSafe(`${rel}/arte`);
  await fs.mkdir(/*turbopackIgnore: true*/ arteDir, { recursive: true }).catch(() => undefined);
  await arquivarArte(arteDir).catch(() => undefined);

  const slidesBlobUrls: string[] = [];
  let pdfUrl: string | null = null;
  let n = 0;

  for (const f of arquivos) {
    const ext = f.name.split(".").pop()!.toLowerCase();
    const nome =
      ext === "pdf"
        ? "arte.pdf"
        : `slide-${String(++n).padStart(2, "0")}.${ext === "jpeg" ? "jpg" : ext}`;
    const targetRel = `${rel}/arte/${nome}`;
    if (ext === "pdf") pdfUrl = targetRel;
    else slidesBlobUrls.push(targetRel);

    await fs
      .writeFile(
        /*turbopackIgnore: true*/ path.join(arteDir, nome),
        Buffer.from(await f.arrayBuffer())
      )
      .catch(() => undefined);
  }

  await atualizarPost(
    pauta,
    post,
    {
      origemArte: "designer",
      slidesBlobUrls,
      pdfUrl,
    },
    sessao.tenantId
  );
  return Response.json(await lerPost(pauta, post, sessao.tenantId));
}
