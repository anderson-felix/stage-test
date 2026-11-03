"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe, Share2, TrendingUp, FolderOpen, Coins, Mail, ShieldCheck } from "lucide-react";
import { ClaudeChat } from "@/components/ClaudeChat";

type Status = {
  site: { url: string; online: boolean; status: number; ms: number; https: boolean };
  workspace: {
    files: number;
    memory: { file: string; filled: boolean }[];
    lastChange: { when: string; subject: string } | null;
  };
  social: {
    connected: boolean;
    accounts?: { platform: string; handle: string; oauthConnected: boolean }[];
    pautasCount?: number;
    postsCount?: number;
  };
  ads: { connected: boolean; campaignsCount?: number };
  tenant?: {
    id: string;
    name: string;
    slug: string;
    planTier: string;
    tokenCreditBalance: number;
    onboardingCompleted: boolean;
  };
  metrics?: {
    totalLps: number;
    publishedLps: number;
    totalViews: number;
    totalLeads: number;
    conversionRate: number;
    totalCampaigns: number;
    totalPautas: number;
    totalPosts: number;
    totalMediaAssets: number;
  };
  domain?: {
    id: string;
    domain: string;
    dnsStatus: string;
    sslStatus: string;
  } | null;
  emailConfig?: {
    senderDomain: string | null;
    senderEmail: string | null;
    verificationStatus: string;
    leadDestinationEmails: string[];
  } | null;
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
  const metrics = status?.metrics;
  const tenant = status?.tenant;

  const cards: { href: string; icon: typeof Globe; label: string; title: string; sub: string; badge: string; tone: Tone }[] = [
    {
      href: "/site",
      icon: Globe,
      label: "Site & Landing Pages",
      title: metrics ? `${metrics.publishedLps}/${metrics.totalLps} LPs no ar` : status ? (status.site.online ? "Online" : "Fora do ar") : "…",
      sub: metrics
        ? `${metrics.totalViews.toLocaleString("pt-BR")} visitas · ${status?.domain?.domain ?? "subdomínio padrão"}`
        : "verificando",
      badge: status?.domain?.dnsStatus === "VERIFIED" ? "DOMÍNIO ATIVO" : status?.site.online ? "ONLINE" : "CONFIGURAR",
      tone: status?.domain?.dnsStatus === "VERIFIED" || status?.site.online ? "ok" : "warn",
    },
    {
      href: "/social",
      icon: Share2,
      label: "Social & Editorial",
      title: metrics ? `${metrics.totalPautas} pautas · ${metrics.totalPosts} posts` : "…",
      sub: status?.social.connected ? "Contas OAuth conectadas" : "Produção ativa · conectar OAuth para autopublicação",
      badge: status?.social.connected ? "CONECTADO" : metrics && metrics.totalPautas > 0 ? "EM PRODUÇÃO" : "CONECTAR",
      tone: status?.social.connected ? "ok" : metrics && metrics.totalPautas > 0 ? "ok" : "off",
    },
    {
      href: "/leads",
      icon: TrendingUp,
      label: "Tráfego & Leads",
      title: metrics ? `${metrics.totalLeads} leads (${metrics.conversionRate}% conv.)` : "…",
      sub: metrics ? `${metrics.totalCampaigns} campanhas Google Ads` : "verificando",
      badge: metrics && metrics.totalCampaigns > 0 ? "ATIVO" : "CRIAR CAMPANHA",
      tone: metrics && metrics.totalCampaigns > 0 ? "ok" : "off",
    },
    {
      href: "/claude",
      icon: FolderOpen,
      label: "Biblioteca da Marca",
      title: status ? `${status.workspace.files} ativos visuais` : "…",
      sub: `BrandProfile ${memoryFilled}/${memoryTotal} preenchido`,
      badge: memoryFilled === memoryTotal ? "COMPLETO" : "EM AJUSTE",
      tone: memoryFilled === memoryTotal ? "ok" : "warn",
    },
  ];

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted">{now ? greeting(now.getHours()) : " "}</div>
          <h1 className="text-2xl font-semibold">{tenant?.name ?? "Stage Consulting"} · Marketing Hub</h1>
          <p className="text-sm text-muted">Sua operação de marketing, LPs, tráfego e conteúdo em tempo real.</p>
        </div>

        {tenant && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs">
              <Coins size={15} className="text-brand-soft" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted">Saldo de Créditos IA</div>
                <div className="font-mono font-semibold text-text">
                  {tenant.tokenCreditBalance.toLocaleString("pt-BR")} créditos
                </div>
              </div>
            </div>

            <Link
              href="/conta"
              className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs transition hover:border-brand/50"
            >
              {status?.emailConfig?.verificationStatus === "VERIFIED" ? (
                <ShieldCheck size={15} className="text-ok" />
              ) : (
                <Mail size={15} className="text-brand-soft" />
              )}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted">E-mail de Leads</div>
                <div className="font-medium text-text">
                  {status?.emailConfig?.verificationStatus === "VERIFIED"
                    ? status.emailConfig.senderEmail ?? "Domínio próprio"
                    : "Fallback Stage Ativo"}
                </div>
              </div>
            </Link>
          </div>
        )}
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
            "Sugira 5 temas de post para o LinkedIn da marca",
            "Crie um roteiro de carrossel sobre adoção de IA",
          ]}
        />
      </div>
    </div>
  );
}
