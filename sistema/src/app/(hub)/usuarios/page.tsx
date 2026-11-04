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

const campo =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-brand";

type Credencial = { nome: string; email: string; senha: string };

const ROLE_LABELS: Record<RoleType, { label: string; desc: string }> = {
  OWNER: {
    label: "OWNER (Proprietário)",
    desc: "Controle total da empresa, domínios, membros e publicação",
  },
  ADMIN: {
    label: "ADMIN (Administrador)",
    desc: "Gerencia membros, integrações, campanhas, LPs e Social",
  },
  EDITOR: {
    label: "EDITOR (Criador)",
    desc: "Cria e edita Landing Pages, posts Social e campanhas Ads",
  },
  VIEWER: {
    label: "VIEWER (Leitor)",
    desc: "Visualiza calendário, métricas, campanhas e leads (somente leitura)",
  },
};

export default function UsuariosPage() {
  const [lista, setLista] = useState<UsuarioPublico[] | null>(null);
  const [eu, setEu] = useState<UsuarioPublico | null>(null);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState(false);
  const [credencial, setCredencial] = useState<Credencial | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

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
    if (
      !confirm(
        `Remover o acesso de ${u.nome} (${u.email}) da empresa ${eu?.tenantName ?? "atual"}?`
      )
    ) {
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
            <h1 className="text-2xl font-semibold">Membros da Empresa</h1>
            {eu?.tenantName && (
              <span className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand-soft">
                <Building2 size={12} /> {eu.tenantName}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            Gestão de acessos e permissões RBAC (`TenantMember`) para o workspace desta empresa.
          </p>
        </div>
        <button
          onClick={() => setNovo(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-hover"
        >
          <UserPlus size={15} /> Convidar / Adicionar Membro
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
              <th className="px-4 py-3 font-medium">Membro</th>
              <th className="px-4 py-3 font-medium">Permissão (Role RBAC)</th>
              <th className="px-4 py-3 font-medium">Situação</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {!lista ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-muted">
                  Carregando membros…
                </td>
              </tr>
            ) : lista.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-muted">
                  Nenhum membro encontrado neste tenant.
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
                            você
                          </span>
                        )}
                        {u.isSuperAdmin && (
                          <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-soft">
                            Super Admin
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
                        <option value="OWNER">OWNER (Proprietário)</option>
                        <option value="ADMIN">ADMIN (Administrador)</option>
                        <option value="EDITOR">EDITOR (Criador)</option>
                        <option value="VIEWER">VIEWER (Leitor)</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {!u.ativo ? (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">
                          Suspenso
                        </span>
                      ) : u.trocarSenha ? (
                        <span className="rounded-full bg-warn/15 px-2 py-0.5 text-warn">
                          Senha provisória
                        </span>
                      ) : (
                        <span className="rounded-full bg-ok/15 px-2 py-0.5 text-ok">Ativo</span>
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
                              `Gerar uma nova senha provisória para ${u.nome}? A senha anterior deixará de funcionar.`
                            )
                          }
                          disabled={ocupado !== null || !u.ativo}
                          className="flex items-center gap-1 rounded-md border border-border bg-bg px-2.5 py-1 text-xs hover:border-brand/50 disabled:opacity-40"
                        >
                          <KeyRound size={12} /> Redefinir senha
                        </button>
                        {!souEu && (
                          <>
                            <button
                              onClick={() =>
                                u.ativo
                                  ? alterar(
                                      u,
                                      { ativo: false },
                                      `Suspender o acesso de ${u.nome}?`
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
                              {u.ativo ? "Suspender" : "Reativar"}
                            </button>
                            <button
                              onClick={() => void removerAcesso(u)}
                              disabled={ocupado !== null}
                              title="Remover acesso deste tenant"
                              className="flex items-center gap-1 rounded-md border border-border bg-bg px-2.5 py-1 text-xs text-danger hover:border-danger/60 disabled:opacity-40"
                            >
                              <Trash2 size={12} /> Remover
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
        {(Object.keys(ROLE_LABELS) as RoleType[]).map((r) => (
          <div key={r} className="rounded-lg border border-border bg-surface p-3 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-text">
              <Shield size={12} className="text-brand-soft" />
              {ROLE_LABELS[r].label}
            </div>
            <p className="mt-1 text-muted">{ROLE_LABELS[r].desc}</p>
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
}) {
  const [copiado, setCopiado] = useState(false);
  const texto = `Convite de Acesso — ${tenantName ?? "Stage Hub"}\nEndereço: ${typeof window !== "undefined" ? window.location.origin : ""}\nE-mail: ${credencial.email}\nSenha provisória: ${credencial.senha}\n(No primeiro acesso a plataforma solicitará a troca de senha.)`;
  return (
    <div className="mt-6 rounded-xl border border-ok/40 bg-ok/10 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">
            Credencial provisória gerada para {credencial.nome} ({credencial.email})
          </div>
          <div className="mt-2 font-mono text-base tracking-wide">{credencial.senha}</div>
          <p className="mt-2 text-xs text-muted">
            Se o usuário já possuía conta em outra empresa, ele foi vinculado a este tenant. Caso seja
            um novo usuário, envie a senha provisória acima.
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
        {copiado ? <Check size={13} className="text-ok" /> : <Copy size={13} />} Copiar convite com
        credenciais
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
          <h2 className="font-semibold">Convidar Membro para a Empresa</h2>
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
          Nome completo
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className={`${campo} mt-1`}
            autoFocus
            placeholder="Ex: Mariana Costa"
          />
        </label>
        <label className="block text-xs text-muted">
          E-mail corporativo
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${campo} mt-1`}
            placeholder="mariana@empresa.com.br"
          />
        </label>
        <label className="block text-xs text-muted">
          Permissão (Role RBAC)
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as RoleType)}
            className={`${campo} mt-1`}
          >
            <option value="OWNER">OWNER — Controle total da empresa</option>
            <option value="ADMIN">ADMIN — Gerencia membros, domínios e campanhas</option>
            <option value="EDITOR">EDITOR — Cria e edita LPs, posts e anúncios</option>
            <option value="VIEWER">VIEWER — Somente visualização de métricas e leads</option>
          </select>
        </label>
        <p className="text-xs text-muted">
          Uma senha provisória será gerada para novos usuários. Usuários já registrados na plataforma
          receberão acesso imediato a esta empresa.
        </p>
        {erro && <p className="text-sm text-danger">{erro}</p>}
        <button
          disabled={enviando || !nome.trim() || !email.trim()}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {enviando && <Loader2 size={14} className="animate-spin" />} Adicionar Membro
        </button>
      </form>
    </div>
  );
}
