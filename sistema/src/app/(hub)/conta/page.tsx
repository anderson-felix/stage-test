"use client";

import { useEffect, useState } from "react";
import { Check, KeyRound, Loader2 } from "lucide-react";
import type { UsuarioPublico } from "@/lib/usuarios";

const campo = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand";

export default function ContaPage() {
  const [eu, setEu] = useState<UsuarioPublico | null>(null);
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    fetch("/api/conta")
      .then((r) => r.json())
      .then(setEu)
      .catch(() => setErro("não foi possível carregar a conta"));
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
      // Navegação completa: o router guardou o pré-carregamento das abas feito quando elas redirecionavam para cá.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (eraProvisoria) window.location.assign("/");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-semibold">Minha conta</h1>
      {eu && (
        <p className="mt-1 text-sm text-muted">
          {eu.nome} · {eu.email} · {eu.papel === "admin" ? "Administrador" : "Membro"}
        </p>
      )}

      {eu?.trocarSenha && (
        <div className="mt-6 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
          Você entrou com uma senha provisória. Escolha a sua senha para começar a usar o hub.
        </div>
      )}

      <form onSubmit={trocar} className="mt-6 space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound size={16} className="text-brand-soft" /> Trocar senha
        </h2>
        <label className="block text-xs text-muted">
          Senha atual{eu?.trocarSenha ? " (a provisória)" : ""}
          <input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} className={`${campo} mt-1`} autoComplete="current-password" />
        </label>
        <label className="block text-xs text-muted">
          Nova senha (mínimo de 8 caracteres)
          <input type="password" value={nova} onChange={(e) => setNova(e.target.value)} className={`${campo} mt-1`} autoComplete="new-password" />
        </label>
        <label className="block text-xs text-muted">
          Confirmar nova senha
          <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className={`${campo} mt-1`} autoComplete="new-password" />
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
    </div>
  );
}
