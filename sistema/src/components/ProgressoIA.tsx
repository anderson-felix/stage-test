"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, AlertCircle, Coins } from "lucide-react";
import type { ChatEvent } from "@/lib/claude";

/** Uma etapa visível de uma geração. `quando` diz quais eventos do Claude mostram que ela começou. */
export type Etapa = { rotulo: string; quando?: (ev: ChatEvent) => boolean };

export type ConfigProgresso = {
  etapas: Etapa[];
  /** Duração típica, em segundos: guia a barra entre um evento e outro. */
  estimativaSeg: number;
};

/** `usouFerramenta`: texto do Claude só conta como "redigindo" depois da primeira leitura (antes é só o plano). */
type Estado = { inicio: number; etapa: number; status: string; usouFerramenta: boolean };

const nomeArquivo = (detail: string) => detail.split(/[\\/]/).filter(Boolean).pop() ?? detail;

/** Frase curta para a linha de status, a partir de um evento de ferramenta. */
function statusDoEvento(ev: Extract<ChatEvent, { type: "tool" }>): string {
  switch (ev.name) {
    case "Read":
      return `Lendo ${nomeArquivo(ev.detail)}`;
    case "Write":
      return `Escrevendo ${nomeArquivo(ev.detail)}`;
    case "Edit":
      return `Ajustando ${nomeArquivo(ev.detail)}`;
    case "Glob":
    case "Grep":
      return "Procurando arquivos de referência";
    case "Skill":
      return "Abrindo a skill";
    case "WebSearch":
    case "WebFetch":
      return "Pesquisando na web";
    case "Render":
      return ev.detail ? `Render: ${ev.detail}` : "Renderizando";
    default:
      return ev.detail || ev.name;
  }
}

/**
 * Acompanha uma geração do Claude: avança as etapas pelos eventos do stream e expõe o estado
 * para o <ProgressoIA>. Use `iniciar()` antes do fetch e passe `onEvento` ao lerStreamClaude.
 */
export function useProgressoIA(config: ConfigProgresso) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erroCreditos, setErroCreditos] = useState<string | null>(null);
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  });

  const iniciar = useCallback(() => {
    setErroCreditos(null);
    setEstado({ inicio: Date.now(), etapa: 0, status: "Começando…", usouFerramenta: false });
  }, []);

  const onEvento = useCallback((ev: ChatEvent) => {
    if (ev.type === "done" && ev.error) {
      const lower = ev.error.toLowerCase();
      if (lower.includes("crédito") || lower.includes("credit") || lower.includes("saldo") || lower.includes("402")) {
        setErroCreditos(ev.error);
      }
    }
    if (ev.type !== "tool" && ev.type !== "text") return;
    const { etapas } = configRef.current;
    setEstado((e) => {
      if (!e) return e;
      if (ev.type === "text" && !e.usouFerramenta) return e.status === "Começando…" ? { ...e, status: "Planejando o trabalho" } : e;
      let etapa = e.etapa;
      // Só avança: a etapa mais adiante cujo critério bate com o evento.
      for (let i = etapas.length - 1; i > etapa; i--) {
        if (etapas[i].quando?.(ev)) {
          etapa = i;
          break;
        }
      }
      if (ev.type === "tool") return { ...e, etapa, status: statusDoEvento(ev), usouFerramenta: true };
      return { ...e, etapa, status: "Redigindo o conteúdo" };
    });
  }, []);

  const parar = useCallback(() => {
    setEstado(null);
  }, []);

  return { estado, erroCreditos, setErroCreditos, iniciar, onEvento, parar, config };
}

function formatar(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

function formatarEstimativa(seg: number): string {
  return seg >= 90 ? `~${Math.round(seg / 60)} min` : `~${Math.round(seg / 10) * 10}s`;
}

/** Barra de progresso de uma geração da IA: etapas com check, status atual e tempo. */
export function ProgressoIA({
  titulo,
  progresso,
  aviso,
  erro,
}: {
  titulo: string;
  progresso: ReturnType<typeof useProgressoIA>;
  aviso?: string;
  erro?: string | null;
}) {
  const { estado, config, erroCreditos } = progresso;
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (!estado) return;
    const t = setInterval(() => setAgora(Date.now()), 500);
    return () => clearInterval(t);
  }, [estado]);

  const falhaCreditos =
    erroCreditos ||
    (erro && (erro.toLowerCase().includes("crédito") || erro.toLowerCase().includes("credit") || erro.toLowerCase().includes("saldo")));

  if (falhaCreditos) {
    return (
      <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-text" role="alert">
        <div className="flex items-center gap-2 font-semibold text-danger">
          <Coins size={18} /> Saldo de Créditos de IA Esgotado
        </div>
        <p className="mt-1.5 text-xs text-muted leading-relaxed">
          {falhaCreditos || "O limite de créditos de IA contratado para o seu workspace foi atingido. Recarregue os créditos da sua conta para continuar gerando landing pages, roteiros e artes automaticamente."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            href="/conta"
            className="rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Ver Minha Conta & Recarga
          </Link>
          <a
            href="mailto:contato@stage.consult?subject=Recarga%20de%20Créditos%20IA"
            className="text-xs text-brand-soft hover:underline"
          >
            Falar com a equipe Stage
          </a>
        </div>
      </div>
    );
  }

  if (!estado) return null;

  const decorrido = Math.max(0, (agora - estado.inicio) / 1000);
  const n = config.etapas.length;
  // O tempo empurra a barra devagar (assíntota em 95%); cada etapa alcançada garante um mínimo.
  const porTempo = 95 * (1 - Math.exp((-1.6 * decorrido) / config.estimativaSeg));
  const porEtapa = (estado.etapa / n) * 95;
  const pct = Math.min(95, Math.max(porTempo, porEtapa));
  const passou = decorrido > config.estimativaSeg * 1.3;

  return (
    <div className="rounded-lg border border-border bg-bg p-4 text-sm" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium">
          <Loader2 size={16} className="animate-spin text-brand-soft" /> {titulo}
        </div>
        <span className="shrink-0 font-mono text-xs text-muted">
          {formatar(decorrido)} <span className="opacity-60">/ {formatarEstimativa(config.estimativaSeg)}</span>
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-brand-soft transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="mt-3 space-y-1.5">
        {config.etapas.map((et, i) => {
          const feita = i < estado.etapa;
          const atual = i === estado.etapa;
          return (
            <li key={et.rotulo} className={`flex items-center gap-2 text-xs ${feita ? "text-text" : atual ? "text-text" : "text-muted/60"}`}>
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  feita ? "border-ok bg-ok/15 text-ok" : atual ? "border-brand-soft" : "border-border"
                }`}
              >
                {feita ? <Check size={10} strokeWidth={3} /> : atual ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-soft" /> : null}
              </span>
              <span className={atual ? "font-medium" : ""}>{et.rotulo}</span>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 truncate border-t border-border pt-2 text-xs text-muted" title={estado.status}>
        {estado.status}
      </p>
      <p className="mt-1 text-xs text-muted">
        {passou ? "Está levando mais que o normal, mas segue trabalhando." : aviso}
      </p>
    </div>
  );
}

// ---------- critérios comuns ----------

export const lendo = (ev: ChatEvent) => ev.type === "tool" && ["Read", "Glob", "Grep", "Skill"].includes(ev.name);
export const pensando = (ev: ChatEvent) => ev.type === "text";
export const escrevendo = (ev: ChatEvent) => ev.type === "tool" && (ev.name === "Write" || ev.name === "Edit");
export const renderizando = (ev: ChatEvent) => ev.type === "tool" && ev.name === "Render";
/** Gravou (Write) um arquivo cujo nome bate com o padrão. */
export const gravou = (re: RegExp) => (ev: ChatEvent) => ev.type === "tool" && ev.name === "Write" && re.test(ev.detail);
