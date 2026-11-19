import { exigirEditor } from "@/lib/auth";
import { runClaude } from "@/lib/claude";
import { MIN_GENERATION_CREDITS, InsufficientCreditsError, formatInsufficientCreditsResponse } from "@/lib/credits";
import {
  atualizarPost,
  CANAIS,
  FORMATOS_POR_CANAL,
  novaPastaPauta,
  SERIES,
  type Canal,
  type Formato,
  type Serie,
} from "@/lib/social";
import { buildRoteiroPrompt, carregarContextoMarcaTenant } from "@/lib/prompts";
import prisma from "@/lib/prisma";

type Body = {
  tema?: string;
  angulo?: string;
  dataPlanejada?: string;
  posts?: { canal?: string; formato?: string }[];
  language?: string;
  toneStyle?: string;
  referenceAssetId?: string | null;
};

function parseGeneratedPostsAndCaptions(text: string): Map<
  string,
  { roteiro?: string; legenda?: string; serie?: Serie }
> {
  const map = new Map<string, { roteiro?: string; legenda?: string; serie?: Serie }>();
  const blockRegex = /```(?:markdown|md)?\s*\r?\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(text)) !== null) {
    const content = match[1].trim();
    const firstLine = content.split(/\r?\n/)[0]?.trim() || "";
    const rest = content.split(/\r?\n/).slice(1).join("\n").trim();

    const postHeader = /<!--\s*POST:\s*([a-z0-9-]+)(?:\s*\|\s*SERIE:\s*([a-z0-9-]+))?\s*-->/i.exec(
      firstLine
    );
    if (postHeader?.[1]) {
      const slug = postHeader[1].toLowerCase();
      const rawSerie = postHeader[2]?.toLowerCase();
      const serie = SERIES.find((s) => s === rawSerie);
      const cur = map.get(slug) ?? {};
      cur.roteiro = rest;
      if (serie) cur.serie = serie;
      map.set(slug, cur);
      continue;
    }

    const captionHeader = /<!--\s*LEGENDA:\s*([a-z0-9-]+)\s*-->/i.exec(firstLine);
    if (captionHeader?.[1]) {
      const slug = captionHeader[1].toLowerCase();
      const cur = map.get(slug) ?? {};
      cur.legenda = rest;
      map.set(slug, cur);
    }
  }
  return map;
}

export async function POST(request: Request) {
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

  const body = (await request.json()) as Body;
  const tema = body.tema?.trim() ?? "";
  const angulo = body.angulo?.trim() ?? "";
  const data = body.dataPlanejada?.trim() || null;

  if (!tema || tema.length > 300) {
    return Response.json({ error: "tema obrigatório (até 300 caracteres)" }, { status: 400 });
  }
  if (angulo.length > 500) {
    return Response.json({ error: "ângulo longo demais" }, { status: 400 });
  }
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return Response.json({ error: "data inválida" }, { status: 400 });
  }

  const pares = new Map<string, { canal: Canal; formato: Formato }>();
  for (const p of body.posts ?? []) {
    const canal = CANAIS.find((c) => c === p.canal);
    const formato = canal && FORMATOS_POR_CANAL[canal].find((f) => f === p.formato);
    if (!canal || !formato) {
      return Response.json(
        { error: `Canal/Formato inválido: ${p.canal}/${p.formato}` },
        { status: 400 }
      );
    }
    pares.set(`${canal}-${formato}`, { canal, formato });
  }
  if (pares.size === 0) {
    return Response.json({ error: "escolha ao menos um Canal" }, { status: 400 });
  }

  const postsList = [...pares.values()];
  let pasta: string;
  try {
    pasta = await novaPastaPauta(
      data ?? new Date().toISOString().slice(0, 10),
      tema,
      sessao.tenantId,
      {
        angulo,
        posts: postsList,
        language: body.language,
        toneStyle: body.toneStyle,
        referenceAssetId: body.referenceAssetId ?? null,
      }
    );
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }

  const pautaSlug = pasta.split("/").pop()!;
  const tenantId = sessao.tenantId;
  // Contexto da marca do tenant logado; sem idioma explícito usa o defaultLocale do tenant
  const promptCtx = await carregarContextoMarcaTenant(tenantId, {
    language: body.language,
    toneStyle: body.toneStyle || "Consultivo",
    briefing: `${tema}\n${angulo}`,
  });

  const systemPrompt = buildRoteiroPrompt({
    ...promptCtx,
    tenantId,
    mode: "criar",
    pautaPath: pasta,
    theme: tema,
    angle: angulo,
    plannedDate: data,
    posts: postsList,
  });

  const message = `Gere os Roteiros e Legendas para a Pauta "${tema}" nos canais: ${postsList
    .map((p) => `${p.canal}-${p.formato}`)
    .join(", ")}.`;

  return new Response(
    runClaude(message, undefined, request.signal, {
      tenantId: sessao.tenantId,
      userId: sessao.id,
      featureModule: "social_pauta_generator",
      systemPrompt,
      language: promptCtx.language,
      toneStyle: promptCtx.toneStyle,
      referenceAssetId: body.referenceAssetId ?? null,
      maxTokens: 10000,
      onCompletedText: async (fullText, emitTool) => {
        const parsed = parseGeneratedPostsAndCaptions(fullText);
        for (const p of postsList) {
          const postSlug = `${p.canal}-${p.formato}`;
          const item = parsed.get(postSlug);
          emitTool("Write", `${pasta}/${postSlug}/post.md`);
          await atualizarPost(
            pautaSlug,
            postSlug,
            {
              roteiro: item?.roteiro || fullText.trim(),
              legenda: item?.legenda || "",
              serie: item?.serie,
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
        "X-Pauta-Path": encodeURIComponent(pasta),
      },
    }
  );
}
