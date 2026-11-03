"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Shield, UserPlus, X } from "lucide-react";
import type { UsuarioPublico } from "@/lib/usuarios";

const campo = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand";

type Credencial = { nome: string; email: string; senha: string };

export default function UsuariosPage() {
  const [lista, setLista] = useState<UsuarioPublico[] | null>(null);
  const [eu, setEu] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState(false);
  const [credencial, setCredencial] = useState<Credencial | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar() {
    const [r1, r2] = await Promise.all([fetch("/api/usuarios"), fetch("/api/conta")]);
    if (r1.ok) setLista(await r1.json());
    else setErro((await r1.json()).error ?? "erro ao listar");
    if (r2.ok) setEu((await r2.json()).id);
  }

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, []);

  async function alterar(u: UsuarioPublico, mudanca: Record<string, unknown>, confirmacao?: string) {
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
      if (!res.ok) throw new Error(json.error ?? "erro ao alterar");
      if (json.senhaProvisoria) setCredencial({ nome: u.nome, email: u.email, senha: json.senhaProvisoria });
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Usuários</h1>
          <p className="mt-1 text-sm text-muted">Quem acessa o hub. Todos trabalham no mesmo workspace do TatuOS.</p>
        </div>
        <button
          onClick={() => setNovo(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover"
        >
          <UserPlus size={15} /> Novo usuário
        </button>
      </div>

      {erro && <p className="mt-4 text-sm text-danger">{erro}</p>}

      {credencial && <CartaoCredencial credencial={credencial} onFechar={() => setCredencial(null)} />}

      <div className="mt-6 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Pessoa</th>
              <th className="px-4 py-2.5 font-medium">Papel</th>
              <th className="px-4 py-2.5 font-medium">Situação</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {!lista ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-muted">
                  Carregando…
                </td>
              </tr>
            ) : (
              lista.map((u) => {
                const souEu = u.id === eu;
                return (
                  <tr key={u.id} className={`border-t border-border ${u.ativo ? "" : "opacity-50"}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {u.nome} {souEu && <span className="text-xs font-normal text-muted">(você)</span>}
                      </div>
                      <div className="text-xs text-muted">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.papel}
                        disabled={souEu || ocupado === u.id}
                        onChange={(e) => alterar(u, { papel: e.target.value })}
                        className="rounded-md border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-brand disabled:opacity-60"
                      >
                        <option value="membro">Membro</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {!u.ativo ? (
                        <span className="text-muted">Desativado</span>
                      ) : u.trocarSenha ? (
                        <span className="text-warn">Senha provisória</span>
                      ) : (
                        <span className="text-ok">Ativo</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {ocupado === u.id && <Loader2 size={14} className="mt-1.5 animate-spin text-muted" />}
                        <button
                          onClick={() =>
                            alterar(u, { redefinirSenha: true }, `Gerar uma senha provisória nova para ${u.nome}? A senha atual deixa de funcionar.`)
                          }
                          disabled={ocupado !== null || !u.ativo}
                          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:border-brand/50 disabled:opacity-40"
                        >
                          <KeyRound size={12} /> Redefinir senha
                        </button>
                        {!souEu && (
                          <button
                            onClick={() =>
                              u.ativo
                                ? alterar(u, { ativo: false }, `Desativar ${u.nome}? A pessoa sai do hub na hora.`)
                                : alterar(u, { ativo: true })
                            }
                            disabled={ocupado !== null}
                            className={`rounded-md border border-border px-2 py-1 text-xs disabled:opacity-40 ${
                              u.ativo ? "text-danger hover:border-danger/60" : "hover:border-brand/50"
                            }`}
                          >
                            {u.ativo ? "Desativar" : "Reativar"}
                          </button>
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

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <Shield size={12} /> Administradores gerenciam usuários. Membros usam todas as abas do hub.
      </p>

      {novo && (
        <NovoUsuario
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

function CartaoCredencial({ credencial, onFechar }: { credencial: Credencial; onFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const texto = `Acesso ao Stage Hub\nEndereço: ${typeof window !== "undefined" ? window.location.origin : ""}\nE-mail: ${credencial.email}\nSenha provisória: ${credencial.senha}\n(No primeiro acesso o hub pede para trocar a senha.)`;
  return (
    <div className="mt-6 rounded-xl border border-ok/40 bg-ok/10 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">Senha provisória de {credencial.nome}</div>
          <div className="mt-2 font-mono text-base tracking-wide">{credencial.senha}</div>
          <p className="mt-2 text-xs text-muted">Ela aparece só agora. Envie para a pessoa; no primeiro acesso o hub pede para trocar.</p>
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
        {copiado ? <Check size={13} className="text-ok" /> : <Copy size={13} />} Copiar mensagem com o acesso
      </button>
    </div>
  );
}

function NovoUsuario({ onFechar, onCriado }: { onFechar: () => void; onCriado: (c: Credencial) => void }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<"membro" | "admin">("membro");
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
        body: JSON.stringify({ nome, email, papel }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "erro ao criar");
      onCriado({ nome: json.usuario.nome, email: json.usuario.email, senha: json.senhaProvisoria });
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onFechar}>
      <form onSubmit={criar} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Novo usuário</h2>
          <button type="button" onClick={onFechar} className="text-muted hover:text-text" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <label className="block text-xs text-muted">
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={`${campo} mt-1`} autoFocus />
        </label>
        <label className="block text-xs text-muted">
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${campo} mt-1`} />
        </label>
        <label className="block text-xs text-muted">
          Papel
          <select value={papel} onChange={(e) => setPapel(e.target.value as "membro" | "admin")} className={`${campo} mt-1`}>
            <option value="membro">Membro: usa todas as abas</option>
            <option value="admin">Administrador: também gerencia usuários</option>
          </select>
        </label>
        <p className="text-xs text-muted">O hub gera uma senha provisória para você enviar à pessoa.</p>
        {erro && <p className="text-sm text-danger">{erro}</p>}
        <button
          disabled={enviando || !nome.trim() || !email.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {enviando && <Loader2 size={14} className="animate-spin" />} Criar usuário
        </button>
      </form>
    </div>
  );
}
