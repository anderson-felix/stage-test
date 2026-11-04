"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe, Share2, TrendingUp, FolderOpen, Coins, Mail, ShieldCheck } from "lucide-react";
import { ClaudeChat } from "@/components/ClaudeChat";
import type { DashboardData } from "@/lib/dashboard";

type Tone = "ok" | "warn" | "off";
const TONE: Record<Tone, string> = {
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  off: "bg-surface-2 text-muted",
};

function greeting(h: number) {
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

/** Apresentação do Dashboard: os dados chegam já filtrados pelo tenant no Server Component. */
export function OverviewClient({ data }: { data: DashboardData }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const { lps, leads, ads, social, brand, domain, email, credits, tenant } = data;
  const dominioOk = domain?.dnsStatus === "VERIFIED";
  const emailOk = email?.verificationStatus === "VERIFIED" && !email.useStageFallback;

  const cards: { href: string; icon: typeof Globe; label: string; title: string; sub: string; badge: string; tone: Tone }[] = [
    {
      href: "/site",
      icon: Globe,
      label: "Site & Landing Pages",
      title: `${lps.published}/${lps.total} LPs no ar`,
      sub: `${lps.totalViews.toLocaleString("pt-BR")} visitas · ${domain?.domain ?? "subdomínio padrão"}`,
      badge: dominioOk ? "DOMÍNIO ATIVO" : domain ? "DNS PENDENTE" : "CONFIGURAR",
      tone: dominioOk ? "ok" : "warn",
    },
    {
      href: "/social",
      icon: Share2,
      label: "Social & Editorial",
      title: `${social.pautas} pautas · ${social.posts} posts`,
      sub: `${social.scheduled} agendados · ${social.published} publicados${
        social.connectedAccounts.length ? ` · OAuth: ${social.connectedAccounts.join(", ")}` : ""
      }`,
      badge: social.connectedAccounts.length ? "CONECTADO" : social.pautas > 0 ? "EM PRODUÇÃO" : "CONECTAR",
      tone: social.connectedAccounts.length || social.pautas > 0 ? "ok" : "off",
    },
    {
      href: "/leads",
      icon: TrendingUp,
      label: "Tráfego & Leads",
      title: `${leads.total} leads (${leads.conversionRate}% conv.)`,
      sub: `${leads.last7d} nos últimos 7 dias · ${ads.total} campanhas (${ads.linkedToLp} com LP)`,
      badge: ads.total > 0 ? "ATIVO" : "CRIAR CAMPANHA",
      tone: ads.total > 0 ? "ok" : "off",
    },
    {
      href: "/claude",
      icon: FolderOpen,
      label: "Biblioteca da Marca",
      title: `BrandProfile ${brand.filled}/${brand.total}`,
      sub: brand.onboardingCompleted ? "Onboarding concluído" : "Onboarding pendente",
      badge: brand.filled === brand.total ? "COMPLETO" : "EM AJUSTE",
      tone: brand.filled === brand.total ? "ok" : "warn",
    },
  ];

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted">{now ? greeting(now.getHours()) : " "}</div>
          <h1 className="text-2xl font-semibold">{tenant.name} · Marketing Hub</h1>
          <p className="text-sm text-muted">Sua operação de marketing, LPs, tráfego e conteúdo em tempo real.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs"
            title={credits.recent.map((r) => `${r.featureModule}: -${r.creditsDeducted}`).join("\n") || "Sem consumo recente"}
          >
            <Coins size={15} className="text-brand-soft" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted">Saldo de Créditos IA</div>
              <div className="font-mono font-semibold text-text">
                {credits.balance.toLocaleString("pt-BR")} créditos
              </div>
              <div className="text-[10px] text-muted">
                −{credits.consumed30d.toLocaleString("pt-BR")} em 30 dias ({credits.calls30d} chamadas)
              </div>
            </div>
          </div>

          <Link
            href="/conta"
            className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs transition hover:border-brand/50"
          >
            {emailOk ? <ShieldCheck size={15} className="text-ok" /> : <Mail size={15} className="text-brand-soft" />}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted">E-mail de Leads</div>
              <div className="font-medium text-text">
                {emailOk ? email?.senderEmail ?? "Domínio próprio" : "Fallback Stage Ativo"}
              </div>
            </div>
          </Link>
        </div>
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
          storageKey={`chat:overview:${tenant.id}`}
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

