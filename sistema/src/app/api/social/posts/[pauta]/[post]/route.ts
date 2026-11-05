import { exigirEditor, exigirSessao } from "@/lib/auth";
import { atualizarPost, excluirPost, lerPost, type AtualizacaoPost } from "@/lib/social";
import { collectClaude } from "@/lib/claude";
import { carregarContextoMarcaTenant, buildRoteiroPrompt, buildCopyVendasPrompt } from "@/lib/prompts";
import { InsufficientCreditsError, formatInsufficientCreditsResponse } from "@/lib/credits";

type Ctx = RouteContext<"/api/social/posts/[pauta]/[post]">;

// DELETE [?pauta=1] exclui o Post (ou a Pauta inteira) do tenant autenticado
export async function DELETE(request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { pauta, post } = await ctx.params;
  const pautaInteira = new URL(request.url).searchParams.get("pauta") === "1";
  try {
    return Response.json(await excluirPost(pauta, post, { pautaInteira }, sessao.tenantId));
  } catch (err) {
    const msg = (err as Error).message;
    return Response.json({ error: msg }, { status: msg === "Post não encontrado" ? 404 : 500 });
  }
}

// GET devolve o Post completo do tenant autenticado
export async function GET(_req: Request, ctx: Ctx) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const { pauta, post } = await ctx.params;
  const completo = await lerPost(pauta, post, sessao.tenantId);
  if (!completo) return Response.json({ error: "Post não encontrado" }, { status: 404 });
  return Response.json(completo);
}

// POST gera ou ajusta roteiro/legenda do post social com IA consumindo créditos do tenant
export async function POST(request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { pauta, post } = await ctx.params;
  const postExistente = await lerPost(pauta, post, sessao.tenantId);
  if (!postExistente) {
    return Response.json({ error: "Post não encontrado" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    tipo?: "roteiro" | "legenda" | "ambos";
    instrucao?: string;
    formatoCopy?: "email-prospeccao" | "sequencia-nutricao" | "mensagem-linkedin" | "proposta-executiva";
    language?: string;
    toneStyle?: string;
    referenceAssetId?: string | null;
  };

  const tipo = body.tipo ?? "ambos";
  const tenantBrand = await carregarContextoMarcaTenant(sessao.tenantId, {
    language: body.language,
    toneStyle: body.toneStyle,
  });

  let prompt: string;
  if (tipo === "legenda" && body.formatoCopy) {
    prompt = buildCopyVendasPrompt({
      ...tenantBrand,
      tenantId: sessao.tenantId,
      format: body.formatoCopy,
      briefing: body.instrucao
        ? `${body.instrucao}\n\nContexto do post: ${postExistente.roteiro}`
        : `Gere a copy comercial/legenda executiva baseada no seguinte roteiro:\n${postExistente.roteiro}`,
    });
  } else {
    prompt = [
      buildRoteiroPrompt({
        ...tenantBrand,
        tenantId: sessao.tenantId,
        mode: "criar",
        theme: postExistente.pauta.titulo,
        angle: postExistente.pauta.angulo || undefined,
        plannedDate: postExistente.dataPlanejada,
        posts: [{ canal: postExistente.canal, formato: postExistente.formato }],
      }),
      body.instrucao
        ? `\n\n## INSTRUÇÃO ADICIONAL DE AJUSTE / REFINAMENTO:\n${body.instrucao}`
        : "",
      tipo === "roteiro"
        ? "\nConcentre-se em gerar ou refinar o roteiro dos slides/cenas."
        : tipo === "legenda"
        ? "\nConcentre-se em gerar ou refinar a legenda para publicação."
        : "",
    ].join("");
  }

  const resultado = await collectClaude(prompt, request.signal, {
    tenantId: sessao.tenantId,
    userId: sessao.id,
    featureModule: "social_posts",
    language: body.language,
    toneStyle: body.toneStyle,
    referenceAssetId: body.referenceAssetId,
  });

  if (resultado.error) {
    if (resultado.status === 402 || resultado.error.includes("Saldo de créditos")) {
      return formatInsufficientCreditsResponse(new InsufficientCreditsError(0));
    }
    return Response.json({ error: resultado.error }, { status: 500 });
  }

  const generatedText = resultado.text.trim();
  const mudancas: AtualizacaoPost = {};

  if (tipo === "legenda") {
    mudancas.legenda = generatedText;
  } else if (tipo === "roteiro") {
    mudancas.roteiro = generatedText;
  } else {
    // Tenta extrair blocos POST e LEGENDA se presentes
    const postMatch = /```(?:markdown|md)?\s*\r?\n(?:<!--\s*POST:[^>]*-->\s*\r?\n)?([\s\S]*?)```/i.exec(generatedText);
    const legendaMatch = /<!--\s*LEGENDA:[^>]*-->\s*([\s\S]*?)(?:```|$)/i.exec(generatedText);
    if (postMatch?.[1]) mudancas.roteiro = postMatch[1].trim();
    if (legendaMatch?.[1]) mudancas.legenda = legendaMatch[1].trim();

    if (!mudancas.roteiro && !mudancas.legenda) {
      mudancas.roteiro = generatedText;
    }
  }

  await atualizarPost(pauta, post, mudancas, sessao.tenantId);
  return Response.json(await lerPost(pauta, post, sessao.tenantId));
}

async function handleUpdatePost(request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { pauta, post } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as AtualizacaoPost;
  const mudancas: AtualizacaoPost = {};
  if (typeof body.status === "string") mudancas.status = body.status;
  if (body.dataPlanejada === null || typeof body.dataPlanejada === "string") {
    mudancas.dataPlanejada = body.dataPlanejada;
  }
  if (typeof body.roteiro === "string") mudancas.roteiro = body.roteiro;
  if (typeof body.legenda === "string") mudancas.legenda = body.legenda;
  if (body.link === null || typeof body.link === "string") mudancas.link = body.link;
  if (Object.keys(mudancas).length === 0) {
    return Response.json({ error: "nada para atualizar" }, { status: 400 });
  }

  try {
    // Atualização manual zero-token: salva direto no PostgreSQL sem consumir créditos de IA
    await atualizarPost(pauta, post, mudancas, sessao.tenantId);
    return Response.json(await lerPost(pauta, post, sessao.tenantId));
  } catch (err) {
    const msg = (err as Error).message;
    return Response.json({ error: msg }, { status: msg === "Post não encontrado" ? 404 : 400 });
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  return handleUpdatePost(request, ctx);
}

export async function PUT(request: Request, ctx: Ctx) {
  return handleUpdatePost(request, ctx);
}
