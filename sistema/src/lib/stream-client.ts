import type { ChatEvent } from "./claude";

export class InsufficientCreditsError extends Error {
  constructor(message = "Saldo de créditos de IA esgotado") {
    super(message);
    this.name = "InsufficientCreditsError";
  }
}

/**
 * Lê no navegador uma resposta NDJSON de ChatEvent (chat, /roteiro, /carrossel, /anuncio-google).
 * Chama onEvent a cada evento e lança erro se o turno terminar com erro ou saldo esgotado.
 */
export async function lerStreamClaude(res: Response, onEvent: (ev: ChatEvent) => void): Promise<void> {
  if (res.status === 402) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("stage:credits-depleted"));
    }
    const json = await res.json().catch(() => ({}));
    throw new InsufficientCreditsError(
      json.error ?? "Saldo de créditos de IA esgotado. Recarregue na aba Minha Conta."
    );
  }

  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => ({}));
    const errText = json.error ?? `erro ${res.status}`;
    if (
      res.status === 402 ||
      errText.toLowerCase().includes("crédito") ||
      errText.toLowerCase().includes("credit") ||
      errText.toLowerCase().includes("saldo")
    ) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("stage:credits-depleted"));
      }
      throw new InsufficientCreditsError(errText);
    }
    throw new Error(errText);
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
      if (ev.type === "done") {
        erro = ev.error;
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("stage:credits-updated", {
              detail: { remainingBalance: ev.remainingBalance },
            })
          );
        }
      }
      onEvent(ev);
    }
  }

  if (erro) {
    const lower = erro.toLowerCase();
    if (lower.includes("crédito") || lower.includes("credit") || lower.includes("saldo") || lower.includes("402")) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("stage:credits-depleted"));
      }
      throw new InsufficientCreditsError(erro);
    }
    throw new Error(erro);
  }
}
