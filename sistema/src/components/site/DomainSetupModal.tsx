"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import type { CustomDomainWithInstructions } from "@/lib/domains";

type ProviderGuideKey = "registrobr" | "cloudflare" | "godaddy" | "hostgator";

const PROVIDER_GUIDES: Record<
  ProviderGuideKey,
  {
    name: string;
    badge: string;
    steps: string[];
    tip: string;
  }
> = {
  registrobr: {
    name: "Registro.br",
    badge: "Mais comum no Brasil",
    steps: [
      "Acesse o painel do Registro.br e clique no domínio da sua empresa.",
      "Role até a seção 'DNS' e clique em 'Editar Zona'.",
      "Clique em '+ Nova Entrada', selecione o tipo CNAME, digite o Host (ex.: lp) e cole o Destino ao lado.",
      "Adicione também uma entrada do tipo TXT com o Host de verificação e o Token abaixo.",
      "Clique em 'Salvar Dados' e aguarde de 5 a 30 minutos para propagação.",
    ],
    tip: "O Registro.br não permite CNAME na raiz (@). Por isso, recomendamos fortemente usar um subdomínio dedicado como lp.suaempresa.com.br.",
  },
  cloudflare: {
    name: "Cloudflare",
    badge: "Propagação em ~1 min",
    steps: [
      "Abra sua conta Cloudflare, selecione o domínio e clique em 'DNS' > 'Records'.",
      "Clique em 'Add record', escolha o tipo CNAME, preencha 'Name' e 'Target'.",
      "Importante: Desative a nuvem laranja ('Proxy status: DNS only / Somente DNS') durante a verificação inicial para emissão do SSL.",
      "Adicione o registro TXT de verificação e clique em 'Save'.",
    ],
    tip: "A Cloudflare suporta CNAME Flattening mesmo na raiz (@), mas deixar em modo 'DNS Only' garante validação imediata do certificado gerenciado.",
  },
  godaddy: {
    name: "GoDaddy",
    badge: "Internacional",
    steps: [
      "Acesse 'Meus Produtos' na GoDaddy e clique em 'DNS' ao lado do seu domínio.",
      "Clique em 'Adicionar Novo Registro' e selecione 'CNAME'.",
      "No campo 'Nome', informe apenas o prefixo (ex.: lp) sem o nome do domínio.",
      "No campo 'Valor', cole o endereço de destino da Stage e defina TTL como 1/2 hora.",
      "Adicione também o registro TXT com o token de segurança e salve.",
    ],
    tip: "Na GoDaddy, evite colocar ponto final após o valor do CNAME.",
  },
  hostgator: {
    name: "HostGator / cPanel",
    badge: "Hospedagem compartilhada",
    steps: [
      "No Portal do Cliente HostGator (ou cPanel), abra 'Domínios' > 'Editor de Zona DNS'.",
      "Clique em '+ Adicionar Registro', escolha 'CNAME' e informe o subdomínio e o destino.",
      "Adicione outro registro do tipo 'TXT' com o nome de verificação e o valor do token.",
      "Salve as alterações.",
    ],
    tip: "No cPanel, o sistema pode completar automaticamente o nome do domínio ao final do campo Nome.",
  },
};

export function DomainSetupModal({
  onCloseChanged,
}: {
  onCloseChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fallbackDomain, setFallbackDomain] = useState("");
  const [domains, setDomains] = useState<CustomDomainWithInstructions[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [provider, setProvider] = useState<ProviderGuideKey>("registrobr");
  const [adding, setAdding] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const loadDomains = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/domains");
      if (res.ok) {
        const data = (await res.json()) as {
          fallbackDomain: string;
          customDomains: CustomDomainWithInstructions[];
        };
        setFallbackDomain(data.fallbackDomain);
        setDomains(data.customDomains);
        if (data.customDomains.length > 0 && !selectedId) {
          setSelectedId(data.customDomains[0].id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (open) {
      void loadDomains();
    }
  }, [open, loadDomains]);

  async function copyText(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  }

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setAdding(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: newDomain.trim(),
          dnsProviderHint: PROVIDER_GUIDES[provider].name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao adicionar domínio");
      setNewDomain("");
      await loadDomains();
      if (data.domain?.id) setSelectedId(data.domain.id);
      setFeedback({
        type: "ok",
        text: "Domínio cadastrado! Siga os passos abaixo no seu provedor DNS.",
      });
      onCloseChanged?.();
    } catch (err) {
      setFeedback({ type: "err", text: (err as Error).message });
    } finally {
      setAdding(false);
    }
  }

  async function handleVerify(domainId: string) {
    setVerifyingId(domainId);
    setFeedback(null);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", domainId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao verificar");
      await loadDomains();
      setFeedback({
        type: data.verified ? "ok" : "err",
        text: data.message,
      });
      onCloseChanged?.();
    } catch (err) {
      setFeedback({ type: "err", text: (err as Error).message });
    } finally {
      setVerifyingId(null);
    }
  }

  async function handleDelete(domainId: string) {
    if (!confirm("Remover este domínio customizado?")) return;
    setFeedback(null);
    try {
      const res = await fetch(`/api/domains?id=${encodeURIComponent(domainId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao remover");
      }
      if (selectedId === domainId) setSelectedId(null);
      await loadDomains();
      onCloseChanged?.();
    } catch (err) {
      setFeedback({ type: "err", text: (err as Error).message });
    }
  }

  const activeDomain = domains.find((d) => d.id === selectedId) ?? domains[0] ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text hover:border-brand/50"
      >
        <Globe size={14} className="text-brand-soft" /> Configurar Domínio Próprio
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Globe size={18} className="text-brand-soft" /> Domínios de Landing Pages
                </h2>
                <p className="text-xs text-muted">
                  Publique suas LPs no domínio da sua empresa (ex.:{" "}
                  <code className="text-brand-soft">lp.suaempresa.com.br</code>) ou use o subdomínio gratuito Stage.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {/* Subdomínio Stage Fallback */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ok/30 bg-ok/5 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck size={18} className="text-ok" />
                  <div>
                    <div className="text-xs font-medium text-ok">
                      Subdomínio Gratuito Stage (Sempre Ativo)
                    </div>
                    <div className="font-mono text-sm text-text">
                      https://{fallbackDomain || "cliente.lp.stage.consult"}/&lt;slug-da-lp&gt;
                    </div>
                  </div>
                </div>
                <span className="rounded-md bg-ok/15 px-2.5 py-1 text-[11px] font-medium text-ok">
                  SSL Ativo · Pronto para uso
                </span>
              </div>

              {/* Adicionar novo domínio */}
              <form
                onSubmit={handleAddDomain}
                className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-bg p-4"
              >
                <label className="min-w-[240px] flex-1 text-xs text-muted">
                  Novo domínio ou subdomínio próprio
                  <input
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    placeholder="Ex.: lp.suaempresa.com.br"
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-brand"
                  />
                </label>
                <label className="w-48 text-xs text-muted">
                  Onde está seu DNS?
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as ProviderGuideKey)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-brand"
                  >
                    {Object.entries(PROVIDER_GUIDES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={adding || !newDomain.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                >
                  {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                  Adicionar Domínio
                </button>
              </form>

              {feedback && (
                <div
                  className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
                    feedback.type === "ok"
                      ? "border-ok/40 bg-ok/10 text-ok"
                      : "border-danger/40 bg-danger/10 text-danger"
                  }`}
                >
                  {feedback.type === "ok" ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  )}
                  <span>{feedback.text}</span>
                </div>
              )}

              {loading ? (
                <div className="py-8 text-center text-sm text-muted">
                  Carregando domínios configurados…
                </div>
              ) : domains.length > 0 && activeDomain ? (
                <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
                  {/* Lista lateral de domínios */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Seus Domínios ({domains.length})
                    </div>
                    {domains.map((d) => {
                      const isSel = d.id === activeDomain.id;
                      return (
                        <div
                          key={d.id}
                          onClick={() => setSelectedId(d.id)}
                          className={`cursor-pointer rounded-xl border p-3 transition ${
                            isSel
                              ? "border-brand bg-brand/10"
                              : "border-border bg-bg hover:border-brand/40"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-mono text-xs font-medium text-text">
                              {d.domain}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDelete(d.id);
                              }}
                              className="text-muted hover:text-danger"
                              title="Remover domínio"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                            <span
                              className={`rounded px-1.5 py-0.5 font-medium ${
                                d.dnsStatus === "VERIFIED"
                                  ? "bg-ok/15 text-ok"
                                  : d.dnsStatus === "FAILED"
                                    ? "bg-danger/15 text-danger"
                                    : "bg-warn/15 text-warn"
                              }`}
                            >
                              DNS: {d.dnsStatus}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 font-medium ${
                                d.sslStatus === "ACTIVE"
                                  ? "bg-ok/15 text-ok"
                                  : d.sslStatus === "FAILED"
                                    ? "bg-danger/15 text-danger"
                                    : "bg-surface-2 text-muted"
                              }`}
                            >
                              SSL: {d.sslStatus}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Instruções DNS e guia passo a passo */}
                  <div className="space-y-5 rounded-xl border border-border bg-bg p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                      <div>
                        <div className="font-mono text-base font-semibold text-text">
                          {activeDomain.domain}
                        </div>
                        <div className="text-xs text-muted">
                          {activeDomain.isSubdomain
                            ? "Subdomínio dedicado (Recomendado)"
                            : "Domínio raiz (Apex) — requer ALIAS/CNAME Flattening"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleVerify(activeDomain.id)}
                        disabled={verifyingId === activeDomain.id}
                        className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
                      >
                        {verifyingId === activeDomain.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <RefreshCw size={14} />
                        )}
                        Já configurei — Verificar agora
                      </button>
                    </div>

                    {/* Tabela de registros DNS com cópia em 1 clique */}
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                        1. Adicione estes registros no seu painel DNS
                      </h3>
                      <div className="overflow-x-auto rounded-xl border border-border">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-surface text-muted">
                            <tr>
                              <th className="px-3 py-2">Tipo</th>
                              <th className="px-3 py-2">Nome / Host</th>
                              <th className="px-3 py-2">Valor / Destino</th>
                              <th className="px-3 py-2">TTL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeDomain.records.map((rec, idx) => (
                              <tr key={idx} className="border-t border-border">
                                <td className="px-3 py-2.5 font-mono font-semibold text-brand-soft">
                                  {rec.type}
                                </td>
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1.5 font-mono">
                                    <span>{rec.host}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void copyText(`host-${idx}`, rec.host)
                                      }
                                      className="rounded border border-border p-1 text-muted hover:text-text"
                                      title="Copiar Host"
                                    >
                                      {copiedKey === `host-${idx}` ? (
                                        <Check size={11} className="text-ok" />
                                      ) : (
                                        <Copy size={11} />
                                      )}
                                    </button>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1.5 font-mono">
                                    <span className="max-w-[260px] truncate">
                                      {rec.value}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void copyText(`val-${idx}`, rec.value)
                                      }
                                      className="rounded border border-border p-1 text-muted hover:text-text"
                                      title="Copiar Valor"
                                    >
                                      {copiedKey === `val-${idx}` ? (
                                        <Check size={11} className="text-ok" />
                                      ) : (
                                        <Copy size={11} />
                                      )}
                                    </button>
                                  </div>
                                  <div className="mt-0.5 text-[11px] text-muted">
                                    {rec.purpose}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-muted">{rec.ttl}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Guia passo a passo por provedor */}
                    <div>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                          2. Passo a passo por provedor
                        </h3>
                        <div className="flex flex-wrap gap-1">
                          {(Object.keys(PROVIDER_GUIDES) as ProviderGuideKey[]).map(
                            (k) => (
                              <button
                                key={k}
                                type="button"
                                onClick={() => setProvider(k)}
                                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                                  provider === k
                                    ? "bg-brand text-white"
                                    : "bg-surface text-muted hover:text-text"
                                }`}
                              >
                                {PROVIDER_GUIDES[k].name}
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-surface p-4 text-xs">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-semibold text-text">
                            Como configurar no {PROVIDER_GUIDES[provider].name}
                          </span>
                          <span className="rounded bg-brand/15 px-2 py-0.5 text-[10px] font-medium text-brand-soft">
                            {PROVIDER_GUIDES[provider].badge}
                          </span>
                        </div>
                        <ol className="list-decimal space-y-1.5 pl-4 text-muted">
                          {PROVIDER_GUIDES[provider].steps.map((step, i) => (
                            <li key={i} className="leading-relaxed">
                              {step}
                            </li>
                          ))}
                        </ol>
                        <div className="mt-3 rounded-lg bg-bg px-3 py-2 text-[11px] text-brand-soft">
                          <strong>Dica:</strong> {PROVIDER_GUIDES[provider].tip}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

