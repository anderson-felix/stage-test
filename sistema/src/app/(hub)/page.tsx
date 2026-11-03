"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe, Share2, TrendingUp, FolderOpen } from "lucide-react";
import { ClaudeChat } from "@/components/ClaudeChat";

type Status = {
  site: { url: string; online: boolean; status: number; ms: number; https: boolean };
  workspace: {
    files: number;
    memory: { file: string; filled: boolean }[];
    lastChange: { when: string; subject: string } | null;
  };
  social: { connected: boolean };
  ads: { connected: boolean };
};

type Tone = "ok" | "warn" | "off";
const TONE: Record<Tone, string> = {
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  off: "bg-surface-2 text-muted",
};

function greeting(h: number) {
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export default function Overview() {
  const [now, setNow] = useState<Date | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    (async () => {
      const res = await fetch("/api/status");
      if (res.ok) setStatus(await res.json());
    })();
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const memoryFilled = status?.workspace.memory.filter((m) => m.filled).length ?? 0;
  const memoryTotal = status?.workspace.memory.length ?? 4;

  const cards: { href: string; icon: typeof Globe; label: string; title: string; sub: string; badge: string; tone: Tone }[] = [
    {
      href: "/site",
      icon: Globe,
      label: "Site",
      title: status ? (status.site.online ? "Online" : "Fora do ar") : "…",
      sub: status ? `${new URL(status.site.url).host} · ${status.site.ms}ms` : "verificando",
      badge: status ? (status.site.online ? "OK" : "ERRO") : "…",
      tone: status ? (status.site.online ? "ok" : "warn") : "off",
    },
    {
      href: "/social",
      icon: Share2,
      label: "Social",
      title: "Sem métricas",
      sub: "Instagram e LinkedIn não conectados",
      badge: "CONECTAR",
      tone: "off",
    },
    {
      href: "/leads",
      icon: TrendingUp,
      label: "Tráfego & Leads",
      title: "Sem campanhas",
      sub: "Google Ads em planejamento",
      badge: "EM BREVE",
      tone: "off",
    },
    {
      href: "/claude",
      icon: FolderOpen,
      label: "Arquivos · Claude",
      title: status ? `${status.workspace.files} arquivos` : "…",
      sub: `Memória ${memoryFilled}/${memoryTotal} preenchida`,
      badge: memoryFilled === memoryTotal ? "COMPLETO" : "INCOMPLETO",
      tone: memoryFilled === memoryTotal ? "ok" : "warn",
    },
  ];

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 px-4 py-6">
      <div>
        <div className="text-sm text-muted">{now ? greeting(now.getHours()) : " "}</div>
        <h1 className="text-2xl font-semibold">Stage Consulting · Marketing</h1>
        <p className="text-sm text-muted">Sua operação de marketing, em tempo real.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ href, icon: Icon, label, title, sub, badge, tone }) => (
          <Link key={href} href={href} className="group rounded-xl border border-border bg-surface p-4 transition hover:border-brand/50">
            <div className="flex items-start justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-brand-soft">
                <Icon size={16} />
              </div>
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wider ${TONE[tone]}`}>{badge}</span>
            </div>
            <div className="mt-4 text-[11px] font-medium uppercase tracking-wider text-muted">{label}</div>
            <div className="font-semibold">{title}</div>
            <div className="truncate text-xs text-muted">{sub}</div>
          </Link>
        ))}
      </div>

      <div className="py-2 text-center">
        <div className="font-mono text-4xl font-light tracking-tight tabular-nums">
          {now?.toLocaleTimeString("pt-BR") ?? " "}
        </div>
        <div className="mt-1 text-sm capitalize text-muted">
          {now?.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) ?? " "}
        </div>
      </div>

      <div className="min-h-[420px] flex-1 overflow-hidden rounded-2xl border border-border bg-surface">
        <ClaudeChat
          storageKey="chat:overview"
          suggestions={[
            "Quais são as prioridades do marketing essa semana?",
            "Sugira 5 temas de post para o LinkedIn da Stage",
            "Crie um roteiro de carrossel sobre adoção de IA",
          ]}
        />
      </div>
    </div>
  );
}
