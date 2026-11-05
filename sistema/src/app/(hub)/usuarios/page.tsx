"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Shield,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import type { RoleType } from "@/lib/jwt";
import type { UsuarioPublico } from "@/lib/usuarios";
import { useI18n } from "@/lib/use-i18n";

const campo =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-brand";

type Credencial = { nome: string; email: string; senha: string };

export default function UsuariosPage() {
  const { dict } = useI18n();
  const [lista, setLista] = useState<UsuarioPublico[] | null>(null);
  const [eu, setEu] = useState<UsuarioPublico | null>(null);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState(false);
  const [credencial, setCredencial] = useState<Credencial | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const roleLabels: Record<RoleType, { label: string; desc: string }> = {
    OWNER: {
      label: dict.members.roleOwner,
      desc: dict.members.roleOwnerDesc,
    },
    ADMIN: {
      label: dict.members.roleAdmin,
      desc: dict.members.roleAdminDesc,
    },
    EDITOR: {
      label: dict.members.roleEditor,
      desc: dict.members.roleEditorDesc,
    },
    VIEWER: {
      label: dict.members.roleViewer,
      desc: dict.members.roleViewerDesc,
    },
  };

  async function carregar() {
    const [r1, r2] = await Promise.all([fetch("/api/usuarios"), fetch("/api/conta")]);
    if (r1.ok) setLista(await r1.json());
    else setErro((await r1.json()).error ?? "erro ao listar membros");
    if (r2.ok) setEu(await r2.json());
  }

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, []);

  async function alterar(
    u: UsuarioPublico,
    mudanca: Record<string, unknown>,
    confirmacao?: string
  ) {
    if (confirmacao && !confirm(confirmacao)) return;
    setOcupado(u.id);
    setErro("");
    try {
      const res = await fetch(`/api/usuarios/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mudanca),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "erro ao alterar membro");
      if (json.senhaProvisoria) {
        setCredencial({ nome: u.nome, email: u.email, senha: json.senhaProvisoria });
      }
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function removerAcesso(u: UsuarioPublico) {
    const confirmMsg = dict.members.removeConfirm
      .replace("{nome}", u.nome)
      .replace("{email}", u.email)
      .replace("{empresa}", eu?.tenantName ?? "Stage");

    if (!confirm(confirmMsg)) {
      return;
    }
    setOcupado(u.id);
    setErro("");
    try {
      const res = await fetch(`/api/usuarios/${u.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "erro ao remover acesso");
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{dict.members.title}</h1>
            {eu?.tenantName && (
              <span className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand-soft">
                <Building2 size={12} /> {eu.tenantName}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {dict.members.subtitle}
          </p>
        </div>
        <button
          onClick={() => setNovo(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-hover"
        >
          <UserPlus size={15} /> {dict.members.inviteMember}
        </button>
      </div>

      {erro && <p className="mt-4 text-sm text-danger">{erro}</p>}

      {credencial && (
        <CartaoCredencial
          credencial={credencial}
          tenantName={eu?.tenantName}
          onFechar={() => setCredencial(null)}
        />
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">{dict.members.thMember}</th>
              <th className="px-4 py-3 font-medium">{dict.members.thRole}</th>
              <th className="px-4 py-3 font-medium">{dict.members.thStatus}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.members.thActions}</th>
            </tr>
          </thead>
          <tbody>
            {!lista ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-muted">
                  {dict.members.loadingMembers}
                </td>
              </tr>
            ) : lista.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-muted">
                  {dict.members.noMembers}
                </td>
              </tr>
            ) : (
              lista.map((u) => {
                const souEu = u.id === eu?.id;
                return (
                  <tr
                    key={u.id}
                    className={`border-t border-border ${u.ativo ? "" : "opacity-50"}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium">
                        <span>{u.nome}</span>
                        {souEu && (
                          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-normal text-muted">
                            {dict.members.you}
                          </span>
                        )}
                        {u.isSuperAdmin && (
                          <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-soft">
                            {dict.members.superAdmin}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        disabled={souEu || ocupado === u.id}
                        onChange={(e) => alterar(u, { role: e.target.value })}
                        className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-text outline-none focus:border-brand disabled:opacity-60"
                      >
                        <option value="OWNER">{dict.members.roleOwner}</option>
                        <option value="ADMIN">{dict.members.roleAdmin}</option>
                        <option value="EDITOR">{dict.members.roleEditor}</option>
                        <option value="VIEWER">{dict.members.roleViewer}</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {!u.ativo ? (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">
                          {dict.members.statusSuspended}
                        </span>
                      ) : u.trocarSenha ? (
                        <span className="rounded-full bg-warn/15 px-2 py-0.5 text-warn">
                          {dict.members.statusProvisional}
                        </span>
                      ) : (
                        <span className="rounded-full bg-ok/15 px-2 py-0.5 text-ok">{dict.members.statusActive}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {ocupado === u.id && (
                          <Loader2 size={14} className="mt-1.5 animate-spin text-muted" />
                        )}
                        <button
                          onClick={() =>
                            alterar(
                              u,
                              { redefinirSenha: true },
                              dict.members.resetPasswordConfirm.replace("{nome}", u.nome)
                            )
                          }
                          disabled={ocupado !== null || !u.ativo}
                          className="flex items-center gap-1 rounded-md border border-border bg-bg px-2.5 py-1 text-xs hover:border-brand/50 disabled:opacity-40"
                        >
                          <KeyRound size={12} /> {dict.members.resetPassword}
                        </button>
                        {!souEu && (
                          <>
                            <button
                              onClick={() =>
                                u.ativo
                                  ? alterar(
                                      u,
                                      { ativo: false },
                                      dict.members.suspendConfirm.replace("{nome}", u.nome)
                                    )
                                  : alterar(u, { ativo: true })
                              }
                              disabled={ocupado !== null}
                              className={`rounded-md border border-border bg-bg px-2.5 py-1 text-xs disabled:opacity-40 ${
                                u.ativo
                                  ? "text-warn hover:border-warn/60"
                                  : "text-ok hover:border-ok/60"
                              }`}
                            >
                              {u.ativo ? dict.members.suspend : dict.members.reactivate}
                            </button>
                            <button
                              onClick={() => void removerAcesso(u)}
                              disabled={ocupado !== null}
                              title={dict.members.removeTitle}
                              className="flex items-center gap-1 rounded-md border border-border bg-bg px-2.5 py-1 text-xs text-danger hover:border-danger/60 disabled:opacity-40"
                            >
                              <Trash2 size={12} /> {dict.members.remove}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(roleLabels) as RoleType[]).map((r) => (
          <div key={r} className="rounded-lg border border-border bg-surface p-3 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-text">
              <Shield size={12} className="text-brand-soft" />
              {roleLabels[r].label}
            </div>
            <p className="mt-1 text-muted">{roleLabels[r].desc}</p>
          </div>
        ))}
      </div>

      {novo && (
        <NovoUsuarioModal
          onFechar={() => setNovo(false)}
          onCriado={(c) => {
            setNovo(false);
            setCredencial(c);
            void carregar();
          }}
        />
      )}
    </div>
  );
}

function CartaoCredencial({
  credencial,
  tenantName,
  onFechar,
}: {
  credencial: Credencial;
  tenantName?: string;
  onFechar: () => void;
  dict?: ReturnType<typeof useI18n>["dict"];
}) {
  const { dict } = useI18n();
  const [copiado, setCopiado] = useState(false);
  const texto = dict.members.invitationTemplate
    .replace("{tenantName}", tenantName ?? "Stage Hub")
    .replace("{origin}", typeof window !== "undefined" ? window.location.origin : "")
    .replace("{email}", credencial.email)
    .replace("{senha}", credencial.senha);

  return (
    <div className="mt-6 rounded-xl border border-ok/40 bg-ok/10 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">
            {dict.members.provisionalGenerated
              .replace("{nome}", credencial.nome)
              .replace("{email}", credencial.email)}
          </div>
          <div className="mt-2 font-mono text-base tracking-wide">{credencial.senha}</div>
          <p className="mt-2 text-xs text-muted">
            {dict.members.provisionalDesc}
          </p>
        </div>
        <button onClick={onFechar} className="text-muted hover:text-text" aria-label="Fechar">
          <X size={16} />
        </button>
      </div>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        }}
        className="mt-3 flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:border-brand/50"
      >
        {copiado ? <Check size={13} className="text-ok" /> : <Copy size={13} />} {dict.members.copyInvitation}
      </button>
    </div>
  );
}

function NovoUsuarioModal({
  onFechar,
  onCriado,
}: {
  onFechar: () => void;
  onCriado: (c: Credencial) => void;
}) {
  const { dict } = useI18n();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleType>("EDITOR");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "erro ao convidar membro");
      onCriado({
        nome: json.usuario.nome,
        email: json.usuario.email,
        senha: json.senhaProvisoria,
      });
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onFechar}
    >
      <form
        onSubmit={criar}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-xl border border-border bg-surface p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{dict.members.inviteModalTitle}</h2>
          <button
            type="button"
            onClick={onFechar}
            className="text-muted hover:text-text"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>
        <label className="block text-xs text-muted">
          {dict.members.fullName}
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className={`${campo} mt-1`}
            autoFocus
            placeholder={dict.members.fullNamePlaceholder}
          />
        </label>
        <label className="block text-xs text-muted">
          {dict.members.corpEmail}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${campo} mt-1`}
            placeholder={dict.members.corpEmailPlaceholder}
          />
        </label>
        <label className="block text-xs text-muted">
          {dict.members.roleRbac}
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as RoleType)}
            className={`${campo} mt-1`}
          >
            <option value="OWNER">{dict.members.roleOwner}</option>
            <option value="ADMIN">{dict.members.roleAdmin}</option>
            <option value="EDITOR">{dict.members.roleEditor}</option>
            <option value="VIEWER">{dict.members.roleViewer}</option>
          </select>
        </label>
        <p className="text-xs text-muted">
          {dict.members.modalNotice}
        </p>
        {erro && <p className="text-sm text-danger">{erro}</p>}
        <button
          disabled={enviando || !nome.trim() || !email.trim()}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {enviando && <Loader2 size={14} className="animate-spin" />} {dict.members.addMemberBtn}
        </button>
      </form>
    </div>
  );
}
