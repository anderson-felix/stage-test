import fs from "node:fs/promises";
import path from "node:path";
import { runClaude, type ChatEvent } from "@/lib/claude";
import { atualizarPost, caminhoPost, lerPost } from "@/lib/social";
import { arquivarArte, guardarHtmlNoHistorico, renderizarArte } from "@/lib/render";
import { resolveSafe } from "@/lib/workspace";

type Ctx = RouteContext<"/api/social/posts/[pauta]/[post]/arte">;

/**
 * POST { ajuste? } gera (ou ajusta) a Arte com a skill /carrossel e renderiza no servidor.
 * Responde com o mesmo stream NDJSON do chat; o render aparece como um evento "tool" Render.
 */
export async function POST(request: Request, ctx: Ctx) {
  const { pauta, post } = await ctx.params;
  const atual = await lerPost(pauta, post);
  if (!atual) return Response.json({ error: "Post não encontrado" }, { status: 404 });
  if (!atual.roteiro.trim()) return Response.json({ error: "o Post não tem Roteiro" }, { status: 400 });

  const { ajuste } = (await request.json().catch(() => ({}))) as { ajuste?: string };
  const pedido = ajuste?.trim().slice(0, 1000);

  const message = [
    `Use a skill carrossel, Modo Hub, para o Post em ${atual.path}.`,
    `Leia ${atual.path}/post.md e grave somente ${atual.path}/arte/arte.html.`,
    pedido ? `Ajuste pedido: ${pedido}` : "Gere a Arte completa a partir do Roteiro.",
  ].join("\n");

  if (atual.arte.html) await guardarHtmlNoHistorico(atual.path);
  const claude = runClaude(message, undefined, request.signal);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: ChatEvent) => controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      const reader = claude.getReader();
      let buffer = "";
      let fim: Extract<ChatEvent, { type: "done" }> = { type: "done", error: "Claude encerrou sem resposta" };

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as ChatEvent;
          if (ev.type === "done") fim = ev;
          else send(ev);
        }
      }

      if (!fim.error) {
        try {
          send({ type: "tool", name: "Render", detail: "renderizando os slides…" });
          const r = await renderizarArte(atual.path, atual.canal, atual.formato);
          await atualizarPost(pauta, post, { origemArte: "ia" });
          send({ type: "tool", name: "Render", detail: `${r.slides} slide(s)${r.pdf ? " + PDF" : ""}` });
        } catch (err) {
          fim = { ...fim, error: `Render: ${(err as Error).message}` };
        }
      }
      send(fim);
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

const EXT_PERMITIDAS = new Set(["png", "jpg", "jpeg", "pdf"]);
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * PUT (multipart, campo "arquivos") recebe a Arte do designer: imagens viram slide-01…NN na
 * ordem enviada; um PDF vira arte.pdf. A Arte anterior vai para historico/.
 */
export async function PUT(request: Request, ctx: Ctx) {
  const { pauta, post } = await ctx.params;
  let rel: string;
  try {
    rel = caminhoPost(pauta, post);
  } catch {
    return Response.json({ error: "Post não encontrado" }, { status: 404 });
  }
  if (!(await lerPost(pauta, post))) return Response.json({ error: "Post não encontrado" }, { status: 404 });

  const form = await request.formData();
  const arquivos = form.getAll("arquivos").filter((f): f is File => f instanceof File && f.size > 0);
  if (arquivos.length === 0) return Response.json({ error: "nenhum arquivo enviado" }, { status: 400 });
  for (const f of arquivos) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!EXT_PERMITIDAS.has(ext)) return Response.json({ error: `tipo não aceito: ${f.name}` }, { status: 400 });
    if (f.size > MAX_BYTES) return Response.json({ error: `arquivo maior que 20 MB: ${f.name}` }, { status: 400 });
  }
  if (arquivos.filter((f) => f.name.toLowerCase().endsWith(".pdf")).length > 1) {
    return Response.json({ error: "envie no máximo um PDF" }, { status: 400 });
  }

  const arteDir = resolveSafe(`${rel}/arte`);
  await fs.mkdir(/*turbopackIgnore: true*/ arteDir, { recursive: true });
  await arquivarArte(arteDir);

  let n = 0;
  for (const f of arquivos) {
    const ext = f.name.split(".").pop()!.toLowerCase();
    const nome = ext === "pdf" ? "arte.pdf" : `slide-${String(++n).padStart(2, "0")}.${ext === "jpeg" ? "jpg" : ext}`;
    await fs.writeFile(/*turbopackIgnore: true*/ path.join(arteDir, nome), Buffer.from(await f.arrayBuffer()));
  }
  await atualizarPost(pauta, post, { origemArte: "designer" });
  return Response.json(await lerPost(pauta, post));
}
