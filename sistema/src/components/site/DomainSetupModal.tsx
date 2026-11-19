"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Globe,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import type { CustomDomainWithInstructions } from "@/lib/domains";
import { useI18n } from "@/lib/use-i18n";

type DomainRoutingMode = CustomDomainWithInstructions["routingMode"];

export type ProviderGuideKey = "registrobr" | "cloudflare" | "godaddy" | "hostgator";

export function getProviderGuides(
  routingMode: DomainRoutingMode = "direct-ip",
  targetIpv4: string | null = "172.212.145.134"
): Record<
  ProviderGuideKey,
  {
    name: string;
    badge: string;
    steps: string[];
    tip: string;
  }
> {
  const ip = targetIpv4 || "172.212.145.134";
  if (routingMode === "direct-ip") {
    return {
      registrobr: {
        name: "Registro.br",
        badge: "Mais comum no Brasil",
        steps: [
          "Acesse o painel do Registro.br e clique no domínio da sua empresa.",
          "Role até a seção 'DNS' e clique em 'Editar Zona'.",
          `Clique em '+ Nova Entrada', selecione o tipo A, informe o Host (use @ para domínio raiz ou o prefixo do subdomínio, ex.: lp) e cole o IPv4 ${ip}.`,
          "Adicione também uma entrada do tipo TXT com o Host de verificação (_stage-verify) e o Token de propriedade abaixo.",
          "Salve as alterações no provedor autoritativo e depois clique em 'Já configurei — Verificar agora'.",
        ],
        tip: "No modo direto da VM, o Registro.br aceita registro A diretamente na raiz (@) e em subdomínios, sem exigir ALIAS ou CNAME Flattening.",
      },
      cloudflare: {
        name: "Cloudflare",
        badge: "Propagação rápida",
        steps: [
          "Abra sua conta Cloudflare, selecione o domínio e clique em 'DNS' > 'Records'.",
          `Clique em 'Add record', escolha o tipo A, preencha 'Name' (@ para raiz ou subdomínio, ex.: lp) e 'IPv4 address' com ${ip}.`,
          "Importante: deixe a nuvem cinza ('Proxy status: DNS only / Somente DNS') para que o tráfego e a emissão do certificado TLS no Caddy funcionem diretamente.",
          "Adicione o registro TXT de propriedade e clique em 'Save'. Depois, solicite a verificação aqui no painel.",
        ],
        tip: "Mantenha 'DNS only' (nuvem cinza) tanto na raiz (@) quanto em subdomínios para permitir a validação A + TXT e o certificado HTTPS.",
      },
      godaddy: {
        name: "GoDaddy",
        badge: "Internacional",
        steps: [
          "Acesse 'Meus Produtos' na GoDaddy e clique em 'DNS' ao lado do seu domínio.",
          "Clique em 'Adicionar Novo Registro' e selecione o tipo 'A'.",
          "No campo 'Nome', informe @ para domínio raiz ou apenas o prefixo (ex.: lp) para subdomínio, sem repetir o nome do domínio.",
          `No campo 'Valor', informe o IPv4 ${ip} e defina TTL como 1/2 hora (ou padrão).`,
          "Adicione também o registro tipo 'TXT' com o nome relativo de verificação e o token de propriedade, salve e solicite a verificação.",
        ],
        tip: "Na GoDaddy, use o nome relativo (sem o domínio no final) tanto no registro A quanto no TXT de propriedade.",
      },
      hostgator: {
        name: "HostGator / cPanel",
        badge: "Hospedagem compartilhada",
        steps: [
          "No Portal do Cliente HostGator (ou cPanel), abra 'Domínios' > 'Editor de Zona DNS'.",
          `Clique em '+ Adicionar Registro', escolha tipo 'A', informe o nome (raiz ou subdomínio) e o endereço IPv4 ${ip}.`,
          "Adicione outro registro do tipo 'TXT' com o nome de verificação e o valor do token de propriedade.",
          "Salve as alterações e aguarde a propagação antes de clicar em 'Já configurei — Verificar agora'.",
        ],
        tip: "No cPanel, o sistema pode completar automaticamente o nome do domínio ao final do campo Nome; prefira o nome relativo ou confira o FQDN gerado.",
      },
    };
  }

  return {
    registrobr: {
      name: "Registro.br",
      badge: "Mais comum no Brasil",
      steps: [
        "Acesse o painel do Registro.br e clique no domínio da sua empresa.",
        "Role até a seção 'DNS' e clique em 'Editar Zona'.",
        "Clique em '+ Nova Entrada', selecione o tipo CNAME, digite o Host (ex.: lp) e cole o Destino ao lado.",
        "Adicione também uma entrada do tipo TXT com o Host de verificação e o Token abaixo.",
        "Salve as alterações e depois clique em 'Já configurei — Verificar agora'.",
      ],
      tip: "O Registro.br não permite CNAME na raiz (@). Nesse modo, use um subdomínio dedicado como lp.suaempresa.com.br.",
    },
    cloudflare: {
      name: "Cloudflare",
      badge: "Propagação em ~1 min",
      steps: [
        "Abra sua conta Cloudflare, selecione o domínio e clique em 'DNS' > 'Records'.",
        "Clique em 'Add record', escolha o tipo CNAME, preencha 'Name' e 'Target'.",
        "Importante: deixe 'Proxy status: DNS only / Somente DNS' durante a verificação inicial.",
        "Adicione o registro TXT de propriedade, clique em 'Save' e solicite a verificação.",
      ],
      tip: "Deixar em modo 'DNS Only' garante validação imediata.",
    },
    godaddy: {
      name: "GoDaddy",
      badge: "Internacional",
      steps: [
        "Acesse 'Meus Produtos' na GoDaddy e clique em 'DNS' ao lado do seu domínio.",
        "Clique em 'Adicionar Novo Registro' e selecione 'CNAME'.",
        "No campo 'Nome', informe apenas o prefixo (ex.: lp) sem o nome do domínio.",
        "No campo 'Valor', cole o destino e salve junto ao registro TXT de propriedade.",
      ],
      tip: "Na GoDaddy, evite colocar ponto final após o valor do CNAME.",
    },
    hostgator: {
      name: "HostGator / cPanel",
      badge: "Hospedagem compartilhada",
      steps: [
        "No Portal do Cliente HostGator (ou cPanel), abra 'Domínios' > 'Editor de Zona DNS'.",
        "Clique em '+ Adicionar Registro', escolha 'CNAME' e informe o subdomínio e o destino.",
        "Adicione outro registro do tipo 'TXT' com o nome de verificação e o token de propriedade.",
        "Salve as alterações e solicite a verificação.",
      ],
      tip: "No cPanel, o sistema pode completar automaticamente o nome do domínio ao final do campo Nome.",
    },
  };
}

export type DomainReadinessPhase =
  | "dns_pending"
  | "dns_failed"
  | "tls_provisioning"
  | "tls_failed"
  | "ready";

export function describeDomainSetupState(domain: {
  dnsStatus: string;
  sslStatus: string;
  lastReasonCode?: string | null;
  lastError?: string | null;
}): {
  phase: DomainReadinessPhase;
  dnsLabel: string;
  tlsLabel: string;
  summary: string;
  recoverable: boolean;
} {
  if (domain.dnsStatus === "PENDING") {
    return {
      phase: "dns_pending",
      dnsLabel: "Aguardando verificação",
      tlsLabel: "Aguardando DNS",
      summary:
        "Configure os registros A e TXT no seu provedor DNS autoritativo e clique em \"Já configurei — Verificar agora\".",
      recoverable: true,
    };
  }

  if (domain.dnsStatus === "FAILED") {
    return {
      phase: "dns_failed",
      dnsLabel: "Falha recuperável no DNS",
      tlsLabel: "Bloqueado até validar DNS",
      summary:
        domain.lastError ||
        "Não foi possível confirmar os registros A e TXT ainda. Se acabou de salvar no DNS, aguarde a propagação; o sistema também fará novas tentativas automáticas.",
      recoverable: true,
    };
  }

  // dnsStatus === "VERIFIED"
  if (domain.sslStatus === "ACTIVE") {
    return {
      phase: "ready",
      dnsLabel: "Propriedade e roteamento OK",
      tlsLabel: "HTTPS ativo",
      summary: "Domínio pronto: propriedade DNS verificada e certificado HTTPS ativo para publicação de LPs.",
      recoverable: false,
    };
  }

  if (domain.sslStatus === "FAILED") {
    return {
      phase: "tls_failed",
      dnsLabel: "Propriedade e roteamento OK",
      tlsLabel: "Falha recuperável no TLS",
      summary:
        domain.lastError ||
        "O DNS está verificado, mas houve uma falha na validação do certificado HTTPS. Novas tentativas automáticas serão executadas.",
      recoverable: true,
    };
  }

  return {
    phase: "tls_provisioning",
    dnsLabel: "Propriedade e roteamento OK",
    tlsLabel: "TLS em emissão",
    summary:
      "Propriedade e roteamento DNS verificados. O certificado HTTPS está sendo emitido pelo Caddy; aguarde ficar ativo antes de publicar.",
    recoverable: true,
  };
}

export function DomainSetupModal({
  onCloseChanged,
}: {
  onCloseChanged?: () => void;
}) {
  const { dict } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fallbackDomain, setFallbackDomain] = useState<string | null>(null);
  const [lpFallbackEnabled, setLpFallbackEnabled] = useState(false);
  const [routingMode, setRoutingMode] = useState<DomainRoutingMode>("direct-ip");
  const [targetIpv4, setTargetIpv4] = useState<string | null>("172.212.145.134");
  const [domains, setDomains] = useState<CustomDomainWithInstructions[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [provider, setProvider] = useState<ProviderGuideKey>("registrobr");
  const [adding, setAdding] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "info" | "err"; text: string } | null>(null);

  const loadDomains = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/domains");
      if (res.ok) {
        const data = (await res.json()) as {
          fallbackDomain: string | null;
          lpFallbackEnabled?: boolean;
          routingMode?: DomainRoutingMode;
          targetIpv4?: string | null;
          customDomains: CustomDomainWithInstructions[];
        };
        const fallbackOn = Boolean(data.lpFallbackEnabled && data.fallbackDomain);
        setLpFallbackEnabled(fallbackOn);
        setFallbackDomain(fallbackOn ? data.fallbackDomain : null);
        if (data.routingMode) setRoutingMode(data.routingMode);
        if (data.targetIpv4 !== undefined) setTargetIpv4(data.targetIpv4);
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
      const guides = getProviderGuides(routingMode, targetIpv4);
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: newDomain.trim(),
          dnsProviderHint: guides[provider].name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao adicionar domínio");
      setNewDomain("");
      await loadDomains();
      if (data.domain?.id) setSelectedId(data.domain.id);
      setFeedback({
        type: "info",
        text: "Domínio registrado como pendente. Configure os registros DNS no seu provedor autoritativo e depois clique em \"Já configurei — Verificar agora\".",
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
      const sslActive = data.domain?.sslStatus === "ACTIVE";
      setFeedback({
        type: data.verified ? (sslActive ? "ok" : "info") : "err",
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
  const activeGuides = getProviderGuides(
    activeDomain?.routingMode ?? routingMode,
    activeDomain?.targetIpv4 ?? targetIpv4
  );
  const activeState = activeDomain ? describeDomainSetupState(activeDomain) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text hover:border-brand/50"
      >
        <Globe size={14} className="text-brand-soft" /> {dict.domains.title || "Configurar Domínio Próprio"}
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
                  <Globe size={18} className="text-brand-soft" /> {dict.domains.title || "Domínios de Landing Pages"}
                </h2>
                <p className="text-xs text-muted">
                  {dict.domains.subtitle || "Publique suas LPs no domínio da sua empresa com SSL gerenciado."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                aria-label={dict.common.close || "Fechar"}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {/* Subdomínio Stage Fallback (exibido como ativo somente quando LP_FALLBACK_ENABLED=true) */}
              {lpFallbackEnabled && fallbackDomain ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ok/30 bg-ok/5 px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck size={18} className="text-ok" />
                    <div>
                      <div className="text-xs font-medium text-ok">
                        Subdomínio de Fallback Stage (Ativo)
                      </div>
                      <div className="font-mono text-sm text-text">
                        https://{fallbackDomain}/&lt;slug-da-lp&gt;
                      </div>
                    </div>
                  </div>
                  <span className="rounded-md bg-ok/15 px-2.5 py-1 text-[11px] font-medium text-ok">
                    {dict.domains.statusSslActive || "SSL Ativo · Pronto para uso"}
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg px-4 py-3">
                  <div className="text-xs text-muted">
                    Subdomínio de fallback desativado neste ambiente. Cadastre e verifique um domínio próprio (DNS + certificado HTTPS ativo) para publicar suas Landing Pages.
                  </div>
                </div>
              )}

              {/* Adicionar novo domínio */}
              <form
                onSubmit={handleAddDomain}
                className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-bg p-4"
              >
                <label className="min-w-[240px] flex-1 text-xs text-muted">
                  {dict.domains.addDomain || "Novo domínio ou subdomínio próprio"}
                  <input
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    placeholder={dict.domains.domainPlaceholder || "Ex.: lp.suaempresa.com.br"}
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
                    {Object.entries(activeGuides).map(([k, v]) => (
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
                  {dict.domains.addDomain || "Adicionar Domínio"}
                </button>
              </form>

              {feedback && (
                <div
                  className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
                    feedback.type === "ok"
                      ? "border-ok/40 bg-ok/10 text-ok"
                      : feedback.type === "info"
                        ? "border-brand/40 bg-brand/10 text-text"
                        : "border-danger/40 bg-danger/10 text-danger"
                  }`}
                >
                  {feedback.type === "ok" ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" />
                  ) : feedback.type === "info" ? (
                    <Info size={16} className="mt-0.5 shrink-0 text-brand-soft" />
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
                              title={dict.domains.removeDomain || "Remover domínio"}
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
                            ? "Subdomínio dedicado"
                            : activeDomain.routingMode === "direct-ip"
                              ? "Domínio raiz (Apex) — aceita registro A diretamente (sem ALIAS/CNAME flattening)"
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
                        {verifyingId === activeDomain.id
                          ? (dict.domains.verifying || "Verificando…")
                          : (dict.domains.verifyDns || "Já configurei — Verificar agora")}
                      </button>
                    </div>

                    {/* Estado real: propriedade/roteamento e certificado TLS */}
                    {activeState && (
                      <div
                        className={`rounded-xl border p-3.5 text-xs ${
                          activeState.phase === "ready"
                            ? "border-ok/40 bg-ok/5"
                            : activeState.phase === "dns_failed" || activeState.phase === "tls_failed"
                              ? "border-danger/40 bg-danger/5"
                              : "border-border bg-surface"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-3 font-medium">
                          <span className="flex items-center gap-1.5 text-text">
                            {activeState.phase === "ready" ? (
                              <CheckCircle2 size={14} className="text-ok" />
                            ) : activeState.phase === "dns_failed" || activeState.phase === "tls_failed" ? (
                              <AlertTriangle size={14} className="text-danger" />
                            ) : (
                              <Clock size={14} className="text-warn" />
                            )}
                            DNS: {activeState.dnsLabel}
                          </span>
                          <span className="text-muted">•</span>
                          <span className="text-text">TLS: {activeState.tlsLabel}</span>
                          {activeDomain.lastReasonCode && (
                            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                              {activeDomain.lastReasonCode}
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 leading-relaxed text-muted">{activeState.summary}</p>
                      </div>
                    )}

                    {/* Tabela de registros DNS com nome relativo, nome completo (FQDN) e cópia em 1 clique */}
                    <div>
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                        1. {dict.domains.instructionsTitle || "Altere estes registros no seu provedor DNS autoritativo e depois solicite a verificação"}
                      </h3>
                      <p className="mb-2 text-[11px] text-muted">
                        O registro <strong>TXT</strong> comprova apenas a propriedade do domínio para a aplicação (não é o desafio ACME de certificado). Após o DNS ser verificado, o certificado HTTPS é emitido automaticamente pelo Caddy.
                      </p>
                      <div className="overflow-x-auto rounded-xl border border-border">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-surface text-muted">
                            <tr>
                              <th className="px-3 py-2">Tipo</th>
                              <th className="px-3 py-2">{dict.domains.host || "Nome / Host (Relativo e Completo)"}</th>
                              <th className="px-3 py-2">{dict.domains.target || "Valor / Destino"}</th>
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
                                    <span title="Nome relativo">{rec.host}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void copyText(`host-${idx}`, rec.host)
                                      }
                                      className="rounded border border-border p-1 text-muted hover:text-text"
                                      title={`${dict.domains.copy || "Copiar"} nome relativo`}
                                    >
                                      {copiedKey === `host-${idx}` ? (
                                        <Check size={11} className="text-ok" />
                                      ) : (
                                        <Copy size={11} />
                                      )}
                                    </button>
                                  </div>
                                  {rec.fqdn && rec.fqdn !== rec.host && (
                                    <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-muted">
                                      <span title="Nome completo (FQDN)">{rec.fqdn}</span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void copyText(`fqdn-${idx}`, rec.fqdn)
                                        }
                                        className="rounded border border-border p-0.5 text-muted hover:text-text"
                                        title={`${dict.domains.copy || "Copiar"} nome completo (FQDN)`}
                                      >
                                        {copiedKey === `fqdn-${idx}` ? (
                                          <Check size={10} className="text-ok" />
                                        ) : (
                                          <Copy size={10} />
                                        )}
                                      </button>
                                    </div>
                                  )}
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
                                      title={dict.domains.copy || "Copiar"}
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
                          {(Object.keys(activeGuides) as ProviderGuideKey[]).map(
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
                                {activeGuides[k].name}
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-surface p-4 text-xs">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-semibold text-text">
                            Como configurar no {activeGuides[provider].name}
                          </span>
                          <span className="rounded bg-brand/15 px-2 py-0.5 text-[10px] font-medium text-brand-soft">
                            {activeGuides[provider].badge}
                          </span>
                        </div>
                        <ol className="list-decimal space-y-1.5 pl-4 text-muted">
                          {activeGuides[provider].steps.map((step, i) => (
                            <li key={i} className="leading-relaxed">
                              {step}
                            </li>
                          ))}
                        </ol>
                        <div className="mt-3 rounded-lg bg-bg px-3 py-2 text-[11px] text-brand-soft">
                          <strong>Dica:</strong> {activeGuides[provider].tip}
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

