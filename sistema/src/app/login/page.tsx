"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";

const campo = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 outline-none focus:border-brand";
const rotulo = "mb-1.5 mt-4 block text-xs font-medium uppercase tracking-wider text-muted first:mt-0";

export default function LoginPage() {
  const [setup, setSetup] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [chave, setChave] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/login")
      .then((r) => r.json())
      .then((j) => setSetup(!!j.precisaSetup))
      .catch(() => setSetup(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (setup && senha !== confirmar) {
      setError("as senhas não conferem");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch(setup ? "/api/login/setup" : "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(setup ? { chave, nome, email, senha } : { email, senha }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    // Navegação completa: não reaproveita nada do router de uma sessão anterior.
    if (res.ok) window.location.assign(json.trocarSenha ? "/conta" : "/");
    else setError(json.error ?? "erro ao entrar");
  }

  const pronto = setup ? chave && nome && email && senha && confirmar : email && senha;

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <div className="mb-8">
          <Logo height={32} />
          <div className="mt-3 text-sm text-muted">{setup ? "Primeiro acesso: crie o administrador do hub" : "Hub de Marketing"}</div>
        </div>

        {setup === null ? (
          <p className="text-sm text-muted">Carregando…</p>
        ) : (
          <>
            {setup && (
              <>
                <label className={rotulo} htmlFor="chave">
                  Chave de instalação
                </label>
                <input id="chave" type="password" autoFocus value={chave} onChange={(e) => setChave(e.target.value)} className={campo} />
                <p className="mt-1 text-xs text-muted">É a HUB_PASSWORD do servidor (arquivo .env).</p>
                <label className={rotulo} htmlFor="nome">
                  Seu nome
                </label>
                <input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} className={campo} autoComplete="name" />
              </>
            )}
            <label className={rotulo} htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoFocus={!setup}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={campo}
              autoComplete="username"
            />
            <label className={rotulo} htmlFor="pw">
              Senha
            </label>
            <input
              id="pw"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className={campo}
              autoComplete={setup ? "new-password" : "current-password"}
            />
            {setup && (
              <>
                <label className={rotulo} htmlFor="pw2">
                  Confirmar senha
                </label>
                <input id="pw2" type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className={campo} autoComplete="new-password" />
                <p className="mt-1 text-xs text-muted">Mínimo de 8 caracteres.</p>
              </>
            )}
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <button
              disabled={loading || !pronto}
              className="mt-6 w-full rounded-lg bg-brand py-2.5 font-medium text-white transition hover:bg-brand-hover disabled:opacity-50"
            >
              {loading ? "Entrando…" : setup ? "Criar administrador e entrar" : "Entrar"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
