import { runClaude } from "@/lib/claude";

export async function POST(request: Request) {
  const { message, sessionId } = (await request.json()) as { message?: string; sessionId?: string };
  if (!message?.trim()) return Response.json({ error: "mensagem vazia" }, { status: 400 });
  if (sessionId && !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return Response.json({ error: "sessão inválida" }, { status: 400 });
  }

  return new Response(runClaude(message, sessionId, request.signal), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
