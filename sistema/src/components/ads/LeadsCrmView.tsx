"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  Mail,
  Megaphone,
  RefreshCw,
  Search,
  Send,
  Users,
} from "lucide-react";
import type { CampanhaResumo } from "@/lib/ads";
import { useI18n } from "@/lib/use-i18n";
import { NovaCampanha } from "./NovaCampanha";
import {
  SERVICO_LABEL,
  STATUS_CAMPANHA_COR,
  STATUS_CAMPANHA_LABEL,
  fmtBRL,
} from "./labels";

type LeadItem = {
  id: string;
  landingPageId: string;
  payload: Record<string, unknown>;
  utmData: Record<string, unknown>;
  emailDeliveryStatus: string;
  createdAt: string;
  landingPage: {
    id: string;
    slug: string;
    title: string;
  };
};

type LeadsApiResponse = {
  summary: {
    totalLeads: number;
    leadsToday: number;
    deliverySuccessRate: number;
    filteredTotal: number;
  };
  landingPages: Array<{ id: string; slug: string; title: string }>;
  leads: LeadItem[];
};

export function LeadsCrmView({
  campanhasIniciais,
}: {
  campanhasIniciais: CampanhaResumo[];
}) {
  const { dict } = useI18n();
  const [abaAtiva, setAbaAtiva] = useState<"campanhas" | "leads">("campanhas");
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [data, setData] = useState<LeadsApiResponse | null>(null);
  const [filtroLpId, setFiltroLpId] = useState("");
  const [busca, setBusca] = useState("");
  const [reenviandoId, setReenviandoId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>("");

  const deliveryBadgeMap: Record<string, { label: string; cls: string }> = {
    sent_custom: {
      label: dict.leads.emailSentCustom || "Enviado (Domínio Próprio)",
      cls: "bg-ok/15 text-ok",
    },
    sent_fallback: {
      label: dict.leads.emailSentFallback || "Enviado (Fallback Stage)",
      cls: "bg-brand/15 text-brand-soft",
    },
    queued: {
      label: dict.leads.emailQueued || "Na fila",
      cls: "bg-warn/15 text-warn",
    },
    failed: {
      label: dict.leads.emailFailed || "Falha no envio",
      cls: "bg-danger/15 text-danger",
    },
  };

  const carregarLeads = useCallback(async () => {
    setLoadingLeads(true);
    try {
      const params = new URLSearchParams();
      if (filtroLpId) params.set("landingPageId", filtroLpId);
      if (busca.trim()) params.set("q", busca.trim());
      const res = await fetch(`/api/leads?${params.toString()}`);
      if (res.ok) {
        setData((await res.json()) as LeadsApiResponse);
      }
    } finally {
      setLoadingLeads(false);
    }
  }, [filtroLpId, busca]);

  useEffect(() => {
    void carregarLeads();
  }, [carregarLeads]);

  async function reenviarEmail(leadId: string) {
    setReenviandoId(leadId);
    setFeedback("");
    try {
      const res = await fetch(`/api/leads/${leadId}/resend`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao reenviar");
      await carregarLeads();
      setFeedback("Notificação de lead reenviada por e-mail com sucesso.");
    } catch (err) {
      setFeedback(`Erro ao reenviar: ${(err as Error).message}`);
    } finally {
      setReenviandoId(null);
    }
  }

  const exportCsvHref = `/api/leads?export=csv${
    filtroLpId ? `&landingPageId=${encodeURIComponent(filtroLpId)}` : ""
  }${busca.trim() ? `&q=${encodeURIComponent(busca.trim())}` : ""}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{dict.leads.title || "Tráfego & Leads"}</h1>
          <p className="text-sm text-muted">
            Da palavra-chave ao lead: campanhas Google Ads e CRM de leads capturados pelas suas{" "}
            <Link href="/site#landing-pages" className="text-brand-soft hover:underline">
              Landing Pages
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/conta"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted hover:border-brand/50 hover:text-text"
          >
            <Mail size={13} className="text-brand-soft" /> Configurar E-mail de Leads
          </Link>
          <NovaCampanha />
        </div>
      </div>

      {/* Abas Principais */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setAbaAtiva("campanhas")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
            abaAtiva === "campanhas"
              ? "bg-brand text-white"
              : "border border-border bg-surface text-muted hover:text-text"
          }`}
        >
          <Megaphone size={15} />
          <span>{dict.leads.tabCampaigns || "Campanhas Google Ads"} ({campanhasIniciais.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setAbaAtiva("leads")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
            abaAtiva === "leads"
              ? "bg-brand text-white"
              : "border border-border bg-surface text-muted hover:text-text"
          }`}
        >
          <Users size={15} />
          <span>{dict.leads.tabCrm || "CRM de Leads Capturados"} ({data?.summary.totalLeads ?? 0})</span>
        </button>
      </div>

      {abaAtiva === "campanhas" ? (
        <section>
          {campanhasIniciais.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
              <FileSpreadsheet size={22} />
              Nenhuma Campanha ainda. Crie a primeira: com o CSV do Planejador de palavras-chave, a IA monta tudo para o Google Ads Editor.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {campanhasIniciais.map((c) => (
                <Link
                  key={c.slug}
                  href={`/leads/campanhas/${c.slug}`}
                  className="rounded-xl border border-border bg-surface p-4 transition hover:border-brand/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-brand-soft">
                      {SERVICO_LABEL[c.servico]}
                    </div>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        STATUS_CAMPANHA_COR[c.status]
                      }`}
                    >
                      {STATUS_CAMPANHA_LABEL[c.status]}
                    </span>
                  </div>
                  <h3 className="mt-1 font-medium">{c.titulo}</h3>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                    <span>
                      {c.montada
                        ? "Campanha montada"
                        : c.temPesquisa
                          ? "Pesquisa enviada"
                          : c.temSementes
                            ? "Termos sugeridos"
                            : "Sem pesquisa"}
                    </span>
                    {c.orcamentoDiario !== null && (
                      <span>{fmtBRL(c.orcamentoDiario)}/dia</span>
                    )}
                    <span>{c.regiao === "Brazil" ? "Brasil" : c.regiao}</span>
                    {c.lpUrl && (
                      <span className="truncate font-mono text-[11px] text-ok">
                        LP: {c.lpUrl}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          {/* Cards de Resumo */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{dict.leads.totalLeads || "Total de Leads"}</span>
                <Users size={15} className="text-brand-soft" />
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {data?.summary.totalLeads ?? 0}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{dict.leads.leadsToday || "Leads Hoje"}</span>
                <CalendarCheck size={15} className="text-ok" />
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {data?.summary.leadsToday ?? 0}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{dict.leads.deliveryRate || "Taxa de Entrega de E-mail"}</span>
                <CheckCircle2 size={15} className="text-brand-soft" />
              </div>
              <div className="mt-2 text-2xl font-semibold">
                {data?.summary.deliverySuccessRate ?? 100}%
              </div>
            </div>
          </div>

          {/* Barra de Filtros, Busca e Exportação CSV */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder={dict.leads.searchPlaceholder || "Buscar por nome, e-mail, telefone ou empresa…"}
                  className="w-full rounded-lg border border-border bg-bg py-1.5 pl-8 pr-3 text-xs text-text outline-none focus:border-brand"
                />
              </div>

              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs">
                <Filter size={13} className="text-muted" />
                <select
                  value={filtroLpId}
                  onChange={(e) => setFiltroLpId(e.target.value)}
                  className="bg-transparent text-xs text-text outline-none"
                  aria-label="Filtrar por Landing Page"
                >
                  <option value="">{dict.leads.allLps || "Todas as Landing Pages"}</option>
                  {(data?.landingPages ?? []).map((lp) => (
                    <option key={lp.id} value={lp.id}>
                      {lp.title} (/{lp.slug})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void carregarLeads()}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-muted hover:text-text"
              >
                <RefreshCw size={13} className={loadingLeads ? "animate-spin" : ""} />
                {dict.common.refresh || "Atualizar"}
              </button>
              <a
                href={exportCsvHref}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover"
              >
                <Download size={13} /> {dict.common.exportCsv || "Exportar CSV"}
              </a>
            </div>
          </div>

          {feedback && (
            <div className="rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-xs text-brand-soft">
              {feedback}
            </div>
          )}

          {/* Tabela de Leads */}
          {!data || (loadingLeads && data.leads.length === 0) ? (
            <div className="py-10 text-center text-sm text-muted">
              {dict.leads.loadingLeads || "Carregando leads capturados…"}
            </div>
          ) : data.leads.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface/50 px-4 py-10 text-center text-sm text-muted">
              {dict.leads.noLeadsFound || "Nenhum lead encontrado para os filtros selecionados."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3">{dict.leads.nameRole || "Nome / Cargo"}</th>
                    <th className="px-4 py-3">{dict.leads.emailPhone || "E-mail / Telefone"}</th>
                    <th className="px-4 py-3">{dict.leads.company || "Empresa"}</th>
                    <th className="px-4 py-3">{dict.leads.sourceLp || "LP de Origem"}</th>
                    <th className="px-4 py-3">{dict.leads.utmSource || "Origem UTM"}</th>
                    <th className="px-4 py-3">{dict.leads.emailStatus || "Status de E-mail"}</th>
                    <th className="px-4 py-3 text-right">{dict.common.actions || "Ações"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.leads.map((lead) => {
                    const p =
                      lead.payload && typeof lead.payload === "object"
                        ? lead.payload
                        : {};
                    const u =
                      lead.utmData && typeof lead.utmData === "object"
                        ? lead.utmData
                        : {};
                    const name = String(p.nome ?? p.name ?? "Lead");
                    const email = String(p.email ?? "—");
                    const phone =
                      p.telefone || p.phone || p.whatsapp
                        ? String(p.telefone ?? p.phone ?? p.whatsapp)
                        : "—";
                    const company =
                      p.empresa || p.company
                        ? String(p.empresa ?? p.company)
                        : "—";
                    const role =
                      p.cargo || p.role ? String(p.cargo ?? p.role) : null;
                    const utmSource = u.utm_source ? String(u.utm_source) : null;
                    const utmMedium = u.utm_medium ? String(u.utm_medium) : null;
                    const utmCampaign = u.utm_campaign
                      ? String(u.utm_campaign)
                      : null;

                    const badge = deliveryBadgeMap[lead.emailDeliveryStatus] ?? {
                      label: lead.emailDeliveryStatus,
                      cls: "bg-surface-2 text-muted",
                    };

                    return (
                      <tr key={lead.id} className="hover:bg-surface-2/40">
                        <td className="px-4 py-3">
                          <div className="font-medium">{name}</div>
                          {role && <div className="text-xs text-muted">{role}</div>}
                          <div className="mt-0.5 text-[11px] text-muted">
                            {new Date(lead.createdAt).toLocaleString("pt-BR")}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-medium text-text">{email}</div>
                          <div className="text-muted">{phone}</div>
                        </td>
                        <td className="px-4 py-3 text-xs font-medium">{company}</td>
                        <td className="px-4 py-3 text-xs">
                          <Link
                            href={`/site/lp/${lead.landingPage.slug}`}
                            className="font-medium text-brand-soft hover:underline"
                          >
                            {lead.landingPage.title}
                          </Link>
                          <div className="font-mono text-[11px] text-muted">
                            /{lead.landingPage.slug}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted">
                          {utmSource || utmMedium || utmCampaign ? (
                            <div>
                              <div>
                                {utmSource || "-"} / {utmMedium || "-"}
                              </div>
                              {utmCampaign && (
                                <div className="text-[11px]">
                                  camp: {utmCampaign}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span>{dict.common.directTraffic || "Tráfego Direto"}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => void reenviarEmail(lead.id)}
                            disabled={reenviandoId === lead.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg px-2.5 py-1 text-xs font-medium text-text hover:border-brand/50 disabled:opacity-50"
                          >
                            {reenviandoId === lead.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Send size={12} />
                            )}
                            {dict.leads.resendEmail || "Reenviar por E-mail"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

