"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Square, Plus, FileText, Search, Globe, Pencil, Sparkles, Wrench } from "lucide-react";
import type { ChatEvent } from "@/lib/claude";

type Segment = { kind: "text"; text: string } | { kind: "tool"; name: string; detail: string };
type Message = { role: "user" | "assistant"; segments: Segment[]; error?: string };

const TOOL_LABEL: Record<string, { label: string; icon: typeof FileText }> = {
  Read: { label: "Lendo", icon: FileText },
  Glob: { label: "Procurando arquivos", icon: Search },
  Grep: { label: "Buscando", icon: Search },
  Edit: { label: "Editando", icon: Pencil },
  Write: { label: "Criando", icon: Pencil },
  WebSearch: { label: "Pesquisando na web", icon: Globe },
  WebFetch: { label: "Abrindo", icon: Globe },
  Skill: { label: "Usando skill", icon: Sparkles },
};

type Props = {
  storageKey: string; // separa a conversa da Visão Geral da do Claude Code
  suggestions?: string[];
  placeholder?: string;
  onFilesChanged?: () => void;
};

export function ClaudeChat({ storageKey, suggestions = [], placeholder = "Peça algo ao Claude…", onFilesChanged }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string>();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Restaura a conversa deste navegador
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (saved) {
        setMessages(saved.messages ?? []);
        setSessionId(saved.sessionId);
      }
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    if (busy) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ messages, sessionId }));
    } catch {}
  }, [messages, sessionId, busy, storageKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function updateLast(fn: (m: Message) => Message) {
    setMessages((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);
  }

  function apply(ev: ChatEvent) {
    if (ev.type === "session") setSessionId(ev.id);
    else if (ev.type === "text_start")
      updateLast((m) => ({ ...m, segments: [...m.segments, { kind: "text", text: "" }] }));
    else if (ev.type === "text")
      updateLast((m) => {
        const segs = [...m.segments];
        const last = segs[segs.length - 1];
        if (last?.kind === "text") segs[segs.length - 1] = { ...last, text: last.text + ev.delta };
        else segs.push({ kind: "text", text: ev.delta });
        return { ...m, segments: segs };
      });
    else if (ev.type === "tool") {
      updateLast((m) => ({ ...m, segments: [...m.segments, { kind: "tool", name: ev.name, detail: ev.detail }] }));
      if (ev.name === "Edit" || ev.name === "Write") onFilesChanged?.();
    } else if (ev.type === "done" && ev.error) updateLast((m) => ({ ...m, error: ev.error }));
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", segments: [{ kind: "text", text: message }] },
      { role: "assistant", segments: [] },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `erro ${res.status}`);

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) apply(JSON.parse(line) as ChatEvent);
      }
    } catch (err) {
      if (!controller.signal.aborted) updateLast((m) => ({ ...m, error: (err as Error).message }));
    } finally {
      setBusy(false);
      abortRef.current = null;
      onFilesChanged?.();
    }
  }

  function reset() {
    abortRef.current?.abort();
    setMessages([]);
    setSessionId(undefined);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles size={15} className="text-brand-soft" />
          <span className="font-medium">Claude</span>
          <span className="text-muted">· contexto da Stage carregado</span>
        </div>
        <button onClick={reset} title="Nova conversa" className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-text">
          <Plus size={16} />
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/15">
              <Sparkles className="text-brand-soft" size={20} />
            </div>
            <div>
              <div className="font-medium">Converse com o Claude</div>
              <p className="mt-1 max-w-sm text-sm text-muted">
                Ele conhece a memória, a identidade e as skills do marketing da Stage. Peça um roteiro, uma análise ou uma
                alteração em arquivo.
              </p>
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-col gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-border px-4 py-1.5 text-sm text-muted transition hover:border-brand/60 hover:text-text"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.map((m, i) => (
              <MessageView key={i} message={m} pending={busy && i === messages.length - 1} />
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-border p-3"
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-border bg-surface-2 p-2 focus-within:border-brand/70">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={placeholder}
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted"
          />
          {busy ? (
            <button type="button" onClick={() => abortRef.current?.abort()} title="Parar" className="rounded-lg bg-surface p-2 text-text hover:bg-border">
              <Square size={16} />
            </button>
          ) : (
            <button disabled={!input.trim()} title="Enviar" className="rounded-lg bg-brand p-2 text-white hover:bg-brand-hover disabled:opacity-40">
              <ArrowUp size={16} />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-center text-[11px] text-muted">Enter envia · Shift+Enter quebra linha</p>
      </form>
    </div>
  );
}

function MessageView({ message, pending }: { message: Message; pending: boolean }) {
  if (message.role === "user") {
    return (
      <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-white">
        {message.segments.map((s) => (s.kind === "text" ? s.text : "")).join("")}
      </div>
    );
  }
  const empty = message.segments.every((s) => s.kind === "text" && !s.text);
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed">
      {message.segments.map((s, i) =>
        s.kind === "tool" ? (
          <ToolChip key={i} name={s.name} detail={s.detail} />
        ) : s.text ? (
          <div key={i} className="prose-chat">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.text}</ReactMarkdown>
          </div>
        ) : null,
      )}
      {pending && empty && <div className="animate-pulse text-muted">Pensando…</div>}
      {message.error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-danger">{message.error}</div>
      )}
    </div>
  );
}

function ToolChip({ name, detail }: { name: string; detail: string }) {
  const { label, icon: Icon } = TOOL_LABEL[name] ?? { label: name, icon: Wrench };
  return (
    <div className="flex w-fit max-w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-muted">
      <Icon size={12} className="shrink-0 text-brand-soft" />
      <span className="shrink-0">{label}</span>
      {detail && <span className="truncate font-mono text-text/80">{detail}</span>}
    </div>
  );
}
