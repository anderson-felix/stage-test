import { spawn } from "node:child_process";
import path from "node:path";
import { claudeBin, workspaceDir } from "./config";

/** Eventos normalizados que o front-end recebe (um JSON por linha). */
export type ChatEvent =
  | { type: "session"; id: string }
  | { type: "text_start" }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; detail: string }
  | { type: "done"; error?: string; costUsd?: number };

// Sem Bash: o time mexe em conteúdo e arquivos, não roda comandos nem faz deploy.
const ALLOWED_TOOLS = ["Read", "Edit", "Write", "Glob", "Grep", "WebSearch", "WebFetch", "Skill", "TodoWrite"];
const DISALLOWED_TOOLS = ["Bash", "PowerShell", "Artifact", "ArtifactComments", "ArtifactData"];

const SYSTEM_APPEND = `Você está rodando dentro do Stage Hub, a central web do marketing da Stage Consulting.
A pessoa conversa com você por um chat no navegador: ela não vê terminal nem diffs.
- Responda em português, direto e curto. Use markdown leve.
- Ao criar ou alterar arquivos, diga o caminho relativo de cada um no final.
- Você não tem acesso a terminal; se algo exigir rodar comando ou fazer deploy, explique o que precisa ser feito.`;

/** Subconjunto das linhas stream-json do Claude Code que o hub usa. */
type CliLine = {
  type?: string;
  subtype?: string;
  session_id?: string;
  parent_tool_use_id?: string | null;
  event?: {
    type?: string;
    content_block?: { type?: string };
    delta?: { type?: string; text?: string };
  };
  message?: { content?: { type: string; name?: string; input?: Record<string, unknown> }[] };
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
};

function toolDetail(name: string, input: Record<string, unknown>): string {
  const rel = (p: unknown) =>
    typeof p === "string" ? path.relative(workspaceDir(), p).split(path.sep).join("/") || p : "";
  switch (name) {
    case "Read":
    case "Edit":
    case "Write":
      return rel(input.file_path);
    case "Glob":
    case "Grep":
      return String(input.pattern ?? "");
    case "WebSearch":
      return String(input.query ?? "");
    case "WebFetch":
      return String(input.url ?? "");
    case "Skill":
      return String(input.skill ?? "");
    default:
      return "";
  }
}

/** Roda um turno inteiro e devolve só o texto final, para rotas que precisam de JSON e não de stream. */
export async function collectClaude(message: string, signal: AbortSignal): Promise<{ text: string; error?: string }> {
  const reader = runClaude(message, undefined, signal).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let error: string | undefined;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const ev = JSON.parse(line) as ChatEvent;
      if (ev.type === "text_start") text = ""; // só interessa o último bloco de texto
      else if (ev.type === "text") text += ev.delta;
      else if (ev.type === "done") error = ev.error;
    }
  }
  return { text, error };
}

/**
 * Roda um turno do Claude Code em modo headless dentro do workspace e devolve
 * um stream NDJSON de ChatEvent. Usa o login local do Claude Code, ou
 * ANTHROPIC_API_KEY quando estiver definida no ambiente.
 */
export function runClaude(message: string, sessionId: string | undefined, signal: AbortSignal): ReadableStream<Uint8Array> {
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--permission-mode", "acceptEdits",
    "--allowedTools", ALLOWED_TOOLS.join(","),
    "--disallowedTools", DISALLOWED_TOOLS.join(","),
    "--append-system-prompt", SYSTEM_APPEND,
  ];
  if (sessionId) args.push("--resume", sessionId);

  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (ev: ChatEvent) => {
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      };
      const finish = (ev: Extract<ChatEvent, { type: "done" }>) => {
        if (closed) return;
        send(ev);
        closed = true;
        controller.close();
      };

      const child = spawn(claudeBin(), args, { cwd: workspaceDir(), windowsHide: true });
      signal.addEventListener("abort", () => child.kill());

      let buffer = "";
      let stderr = "";
      let gotResult = false;

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg: CliLine;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.type === "system" && msg.subtype === "init") {
            send({ type: "session", id: msg.session_id ?? "" });
          } else if (msg.type === "stream_event" && !msg.parent_tool_use_id) {
            const ev = msg.event ?? {};
            if (ev.type === "content_block_start" && ev.content_block?.type === "text") {
              send({ type: "text_start" });
            } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
              send({ type: "text", delta: ev.delta.text ?? "" });
            }
          } else if (msg.type === "assistant" && !msg.parent_tool_use_id) {
            for (const block of msg.message?.content ?? []) {
              if (block.type === "tool_use") {
                const name = block.name ?? "";
                send({ type: "tool", name, detail: toolDetail(name, block.input ?? {}) });
              }
            }
          } else if (msg.type === "result") {
            gotResult = true;
            finish({
              type: "done",
              error: msg.is_error ? String(msg.result ?? "erro no Claude") : undefined,
              costUsd: msg.total_cost_usd,
            });
          }
        }
      });
      child.stderr.on("data", (c) => (stderr += c));
      child.on("error", (err) => finish({ type: "done", error: err.message }));
      child.on("close", (code) => {
        if (!gotResult) {
          finish({
            type: "done",
            error: signal.aborted ? "interrompido" : stderr.trim() || `Claude encerrou com código ${code}`,
          });
        }
      });

      child.stdin.end(message);
    },
  });
}
