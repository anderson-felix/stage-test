"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Building2,
} from "lucide-react";
import type { UsuarioPublico } from "@/lib/usuarios";
import type { TenantEmailConfigWithDiagnostics } from "@/lib/email-service";

const campo =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand";

export default function ContaPage() {
  const [aba, setAba] = useState<"seguranca" | "email">("seguranca");
  const [eu, setEu] = useState<UsuarioPublico | null>(null);
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);

  // Estado da aba E-mail Self-Service
  const [emailCfg, setEmailCfg] = useState<TenantEmailConfigWithDiagnostics | null>(null);
  const [destinosTxt, setDestinosTxt] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderDomain, setSenderDomain] = useState("");
  const [useFallback, setUseFallback] = useState(true);
  const [salvandoEmail, setSalvandoEmail] = useState(false);
  const [verificandoDns, setVerificandoDns] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/conta")
      .then((r) => r.json())
      .then((data: UsuarioPublico) => {
        setEu(data);
      })
      .catch(() => setErro("não foi possível carregar a conta"));

    fetch("/api/conta/email")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg: TenantEmailConfigWithDiagnostics | null) => {
        if (cfg) {
          setEmailCfg(cfg);
          setDestinosTxt(cfg.leadDestinationEmails.join(", "));
          setSenderName(cfg.senderName || "");
          setSenderEmail(cfg.senderEmail || "");
          setSenderDomain(cfg.senderDomain || "");
          setUseFallback(cfg.useStageFallback);
        }
      })
      .catch(() => undefined);
  }, []);

  async function trocar(e: React.FormEvent) {
    e.preventDefault();
    if (nova !== confirmar) {
      setErro("as senhas novas não conferem");
      return;
    }
    setSalvando(true);
    setErro("");
    setOk(false);
    try {
      const res = await fetch("/api/conta", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual: atual, novaSenha: nova }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "erro ao trocar a senha");
      const eraProvisoria = eu?.trocarSenha;
      setEu(json);
      setAtual("");
      setNova("");
      setConfirmar("");
      setOk(true);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (eraProvisoria) window.location.assign("/");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function salvarPreferenciasEmail(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoEmail(true);
    setEmailMsg(null);
    const listaDestinos = destinosTxt
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/conta/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadDestinationEmails: listaDestinos,
          senderName,
          senderEmail,
          useStageFallback: useFallback,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar configurações de e-mail");
      setEmailCfg(data);
      setEmailMsg({
        type: "ok",
        text: "Configurações de destinatários e remetente salvas com sucesso!",
      });
    } catch (err) {
      setEmailMsg({ type: "err", text: (err as Error).message });
    } finally {
      setSalvandoEmail(false);
    }
  }

  async function cadastrarDominioResend() {
    if (!senderDomain.trim()) return;
    setSalvandoEmail(true);
    setEmailMsg(null);
    const listaDestinos = destinosTxt
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/conta/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderDomain: senderDomain.trim(),
          senderEmail: senderEmail.trim() || `contato@${senderDomain.trim()}`,
          senderName: senderName.trim(),
          leadDestinationEmails: listaDestinos,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao registrar domínio");
      setEmailCfg(data);
      if (data.senderEmail) setSenderEmail(data.senderEmail);
      setEmailMsg({
        type: "ok",
        text:
          data.diagnosticMessage ||
          "Domínio registrado! Configure os registros SPF/DKIM abaixo no seu DNS.",
      });
    } catch (err) {
      setEmailMsg({ type: "err", text: (err as Error).message });
    } finally {
      setSalvandoEmail(false);
    }
  }

  async function verificarDominioResend() {
    setVerificandoDns(true);
    setEmailMsg(null);
    try {
      const res = await fetch("/api/conta/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao verificar DNS");
      setEmailCfg(data);
      setUseFallback(data.useStageFallback);
      setEmailMsg({
        type: data.verificationStatus === "VERIFIED" ? "ok" : "err",
        text: data.diagnosticMessage || `Status: ${data.verificationStatus}`,
      });
    } catch (err) {
      setEmailMsg({ type: "err", text: (err as Error).message });
    } finally {
      setVerificandoDns(false);
    }
  }

  async function copyValue(key: string, val: string) {
    await navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Minha Conta & E-mail</h1>
          {eu && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>{eu.nome}</span>
              <span>·</span>
              <span>{eu.email}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-brand-soft">
                <Building2 size={12} /> {eu.tenantName} ({eu.role})
              </span>
            </p>
          )}
        </div>

        <div className="flex rounded-xl border border-border bg-surface p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setAba("seguranca")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              aba === "seguranca" ? "bg-brand text-white" : "text-muted hover:text-text"
            }`}
          >
            <KeyRound size={13} /> Senha & Segurança
          </button>
          <button
            type="button"
            onClick={() => setAba("email")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
              aba === "email" ? "bg-brand text-white" : "text-muted hover:text-text"
            }`}
          >
            <Mail size={13} /> E-mail de Leads & Domínio
          </button>
        </div>
      </div>

      {eu?.trocarSenha && (
        <div className="mt-6 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
          Você entrou com uma senha provisória. Escolha a sua senha para começar a usar o hub.
        </div>
      )}

      {aba === "seguranca" ? (
        <form
          onSubmit={trocar}
          className="mt-6 max-w-lg space-y-3 rounded-xl border border-border bg-surface p-5"
        >
          <h2 className="flex items-center gap-2 font-semibold">
            <KeyRound size={16} className="text-brand-soft" /> Trocar senha
          </h2>
          <label className="block text-xs text-muted">
            Senha atual{eu?.trocarSenha ? " (a provisória)" : ""}
            <input
              type="password"
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
              className={`${campo} mt-1`}
              autoComplete="current-password"
            />
          </label>
          <label className="block text-xs text-muted">
            Nova senha (mínimo de 8 caracteres)
            <input
              type="password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              className={`${campo} mt-1`}
              autoComplete="new-password"
            />
          </label>
          <label className="block text-xs text-muted">
            Confirmar nova senha
            <input
              type="password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              className={`${campo} mt-1`}
              autoComplete="new-password"
            />
          </label>
          {erro && <p className="text-sm text-danger">{erro}</p>}
          {ok && (
            <p className="flex items-center gap-1.5 text-sm text-ok">
              <Check size={14} /> Senha trocada. As sessões em outros aparelhos foram encerradas.
            </p>
          )}
          <button
            disabled={salvando || !atual || !nova || !confirmar}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {salvando && <Loader2 size={14} className="animate-spin" />} Salvar nova senha
          </button>
        </form>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Banner de status do envio de leads */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-3">
              <ShieldCheck
                size={20}
                className={
                  emailCfg?.verificationStatus === "VERIFIED" && !useFallback
                    ? "text-ok"
                    : "text-brand-soft"
                }
              />
              <div>
                <div className="text-sm font-semibold">
                  {emailCfg?.verificationStatus === "VERIFIED" && !useFallback
                    ? `Enviando com domínio próprio (${emailCfg.senderEmail})`
                    : "Fallback Seguro Stage Ativo (leads@stage.consult)"}
                </div>
                <p className="text-xs text-muted">
                  Enquanto seu domínio próprio não estiver verificado via SPF/DKIM, seus leads são entregues imediatamente via{" "}
                  <code>leads@stage.consult</code> com <code>Reply-To</code> para o lead.
                </p>
              </div>
            </div>
            <span
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                emailCfg?.verificationStatus === "VERIFIED"
                  ? "bg-ok/15 text-ok"
                  : "bg-brand/15 text-brand-soft"
              }`}
            >
              DNS: {emailCfg?.verificationStatus ?? "PENDING"}
            </span>
          </div>

          {emailMsg && (
            <div
              className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
                emailMsg.type === "ok"
                  ? "border-ok/40 bg-ok/10 text-ok"
                  : "border-danger/40 bg-danger/10 text-danger"
              }`}
            >
              {emailMsg.type === "ok" ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              )}
              <span>{emailMsg.text}</span>
            </div>
          )}

          {/* Formulário de destinatários e remetente */}
          <form
            onSubmit={salvarPreferenciasEmail}
            className="space-y-4 rounded-xl border border-border bg-surface p-5"
          >
            <h2 className="font-semibold">1. Quem deve receber os avisos de novos leads?</h2>
            <label className="block text-xs text-muted">
              E-mails de destino (separe múltiplos e-mails por vírgula)
              <input
                value={destinosTxt}
                onChange={(e) => setDestinosTxt(e.target.value)}
                placeholder="comercial@suaempresa.com.br, diretoria@suaempresa.com.br"
                className={`${campo} mt-1`}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs text-muted">
                Nome do Remetente
                <input
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Ex.: Comercial — Sua Empresa"
                  className={`${campo} mt-1`}
                />
              </label>
              <label className="block text-xs text-muted">
                E-mail do Remetente (para domínio próprio ou Reply-To)
                <input
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="contato@suaempresa.com.br"
                  className={`${campo} mt-1`}
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={useFallback}
                onChange={(e) => setUseFallback(e.target.checked)}
                className="rounded border-border"
              />
              Usar remetente seguro da Stage (<code>leads@stage.consult</code>) caso o domínio próprio ainda não esteja verificado
            </label>

            <button
              type="submit"
              disabled={salvandoEmail}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {salvandoEmail && <Loader2 size={14} className="animate-spin" />}
              Salvar Destinatários e Preferências
            </button>
          </form>

          {/* Domínio de Envio Self-Service (SPF / DKIM Resend) */}
          <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">
                  2. Domínio de Envio Próprio (SPF / DKIM)
                </h2>
                <p className="text-xs text-muted">
                  Opcional: autentique o domínio da sua empresa para enviar notificações diretamente com seu endereço.
                </p>
              </div>
              {emailCfg?.senderDomain && (
                <button
                  type="button"
                  onClick={() => void verificarDominioResend()}
                  disabled={verificandoDns}
                  className="flex items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand-soft hover:bg-brand/20 disabled:opacity-50"
                >
                  {verificandoDns ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  Verificar DNS na Resend
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[240px] flex-1 text-xs text-muted">
                Domínio da empresa
                <input
                  value={senderDomain}
                  onChange={(e) => setSenderDomain(e.target.value)}
                  placeholder="suaempresa.com.br"
                  className={`${campo} mt-1`}
                />
              </label>
              <button
                type="button"
                onClick={() => void cadastrarDominioResend()}
                disabled={salvandoEmail || !senderDomain.trim()}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-4 py-2 text-sm font-medium text-text hover:border-brand/50 disabled:opacity-50"
              >
                Gerar Registros SPF / DKIM
              </button>
            </div>

            {emailCfg && emailCfg.dnsRecords.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg text-muted">
                    <tr>
                      <th className="px-3 py-2">Registro</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Host / Nome</th>
                      <th className="px-3 py-2">Valor</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emailCfg.dnsRecords.map((rec, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-brand-soft">{rec.record}</td>
                        <td className="px-3 py-2 font-mono">{rec.type}</td>
                        <td className="px-3 py-2 font-mono">
                          <div className="flex items-center gap-1.5">
                            <span>{rec.name}</span>
                            <button
                              type="button"
                              onClick={() => void copyValue(`name-${i}`, rec.name)}
                              className="rounded border border-border p-1 text-muted hover:text-text"
                            >
                              {copiedKey === `name-${i}` ? (
                                <Check size={11} className="text-ok" />
                              ) : (
                                <Copy size={11} />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono">
                          <div className="flex items-center gap-1.5">
                            <span className="max-w-[260px] truncate">{rec.value}</span>
                            <button
                              type="button"
                              onClick={() => void copyValue(`val-${i}`, rec.value)}
                              className="rounded border border-border p-1 text-muted hover:text-text"
                            >
                              {copiedKey === `val-${i}` ? (
                                <Check size={11} className="text-ok" />
                              ) : (
                                <Copy size={11} />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-muted">
                            {rec.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
