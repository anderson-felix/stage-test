import type { ChatEvent } from "./claude";

/**
 * Lê no navegador uma resposta NDJSON de ChatEvent (chat, /roteiro, /carrossel, /anuncio-google).
 * Chama onEvent a cada evento e lança erro se o turno terminar com erro.
 */
export async function lerStreamClaude(res: Response, onEvent: (ev: ChatEvent) => void): Promise<void> {
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? `erro ${res.status}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let erro: string | undefined;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const ev = JSON.parse(line) as ChatEvent;
      if (ev.type === "done") erro = ev.error;
      onEvent(ev);
    }
  }
  if (erro) throw new Error(erro);
}
