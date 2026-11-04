"use client";

import { useEffect, useState } from "react";
import { Languages, Moon, Sun } from "lucide-react";
import { Logo } from "@/components/Logo";
import { normalizeLocale, type SupportedLocale } from "@/lib/i18n";

const campo =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-text outline-none focus:border-brand";
const rotulo =
  "mb-1.5 mt-4 block text-xs font-medium uppercase tracking-wider text-muted first:mt-0";

const LOGIN_I18N: Record<
  SupportedLocale,
  {
    subtitleSetup: string;
    subtitleLogin: string;
    loading: string;
    installKey: string;
    installKeyHint: string;
    yourName: string;
    email: string;
    password: string;
    confirmPassword: string;
    passwordHint: string;
    passwordMismatch: string;
    signingIn: string;
    createAdminBtn: string;
    loginBtn: string;
    loginError: string;
    themeLight: string;
    themeDark: string;
  }
> = {
  "pt-BR": {
    subtitleSetup: "Primeiro acesso: crie o Super Admin da Stage Consulting",
    subtitleLogin: "Hub SaaS Multi-Tenant de Marketing",
    loading: "Carregando…",
    installKey: "Chave de instalação (opcional em dev)",
    installKeyHint: "É a HUB_PASSWORD do servidor (arquivo .env).",
    yourName: "Seu nome completo",
    email: "E-mail corporativo",
    password: "Senha",
    confirmPassword: "Confirmar senha",
    passwordHint: "Mínimo de 8 caracteres.",
    passwordMismatch: "As senhas não conferem",
    signingIn: "Entrando…",
    createAdminBtn: "Criar Super Admin e Entrar",
    loginBtn: "Entrar na Plataforma",
    loginError: "Erro ao autenticar",
    themeLight: "Claro",
    themeDark: "Escuro",
  },
  "en-US": {
    subtitleSetup: "First access: create the Stage Consulting Super Admin",
    subtitleLogin: "Multi-Tenant Marketing SaaS Hub",
    loading: "Loading…",
    installKey: "Installation Key (optional in dev)",
    installKeyHint: "Server HUB_PASSWORD from .env.",
    yourName: "Full name",
    email: "Work email",
    password: "Password",
    confirmPassword: "Confirm password",
    passwordHint: "Minimum 8 characters.",
    passwordMismatch: "Passwords do not match",
    signingIn: "Signing in…",
    createAdminBtn: "Create Super Admin & Sign In",
    loginBtn: "Sign In",
    loginError: "Authentication error",
    themeLight: "Light",
    themeDark: "Dark",
  },
  "es-ES": {
    subtitleSetup: "Primer acceso: crea el Super Admin de Stage Consulting",
    subtitleLogin: "Hub SaaS Multi-Tenant de Marketing",
    loading: "Cargando…",
    installKey: "Clave de instalación (opcional en dev)",
    installKeyHint: "Es la HUB_PASSWORD del servidor (.env).",
    yourName: "Nombre completo",
    email: "Correo corporativo",
    password: "Contraseña",
    confirmPassword: "Confirmar contraseña",
    passwordHint: "Mínimo de 8 caracteres.",
    passwordMismatch: "Las contraseñas no coinciden",
    signingIn: "Ingresando…",
    createAdminBtn: "Crear Super Admin e Ingresar",
    loginBtn: "Iniciar Sesión",
    loginError: "Error al iniciar sesión",
    themeLight: "Claro",
    themeDark: "Oscuro",
  },
};

function applyThemeClass(theme: "LIGHT" | "DARK") {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.classList.add(theme === "LIGHT" ? "light" : "dark");
}

export default function LoginPage() {
  const [setup, setSetup] = useState<boolean | null>(null);
  const [locale, setLocale] = useState<SupportedLocale>("pt-BR");
  const [theme, setTheme] = useState<"LIGHT" | "DARK">("DARK");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [chave, setChave] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof document !== "undefined") {
      const cookieLoc = document.cookie
        .split("; ")
        .find((row) => row.startsWith("NEXT_LOCALE="))
        ?.split("=")[1];
      if (cookieLoc) {
        const norm = normalizeLocale(decodeURIComponent(cookieLoc));
        setLocale(norm);
        document.documentElement.lang = norm;
      }
      const cookieTheme = document.cookie
        .split("; ")
        .find((row) => row.startsWith("NEXT_THEME="))
        ?.split("=")[1];
      if (cookieTheme === "LIGHT" || cookieTheme === "DARK") {
        setTheme(cookieTheme);
        applyThemeClass(cookieTheme);
      }
    }

    fetch("/api/login")
      .then((r) => r.json())
      .then((j) => setSetup(!!j.precisaSetup))
      .catch(() => setSetup(false));
  }, []);

  function handleLocaleChange(next: SupportedLocale) {
    setLocale(next);
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
      document.cookie = `NEXT_LOCALE=${encodeURIComponent(next)}; path=/; max-age=31536000`;
    }
  }

  function handleThemeToggle() {
    const next = theme === "LIGHT" ? "DARK" : "LIGHT";
    setTheme(next);
    applyThemeClass(next);
    if (typeof document !== "undefined") {
      document.cookie = `NEXT_THEME=${next}; path=/; max-age=31536000`;
    }
  }

  const t = LOGIN_I18N[locale];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (setup && senha !== confirmar) {
      setError(t.passwordMismatch);
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch(setup ? "/api/login/setup" : "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        setup
          ? { chave, nome, email, senha, preferredLocale: locale, themePreference: theme }
          : { email, senha }
      ),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(json.trocarSenha ? "/conta" : "/");
    } else {
      setError(json.error ?? t.loginError);
    }
  }

  const pronto = setup ? nome && email && senha && confirmar : email && senha;

  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-bg px-4 py-10 text-text">
      <div className="mb-4 flex w-full max-w-sm items-center justify-end gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs">
          <Languages size={13} className="text-muted" />
          <select
            value={locale}
            onChange={(e) => handleLocaleChange(e.target.value as SupportedLocale)}
            className="bg-transparent text-xs font-medium text-text outline-none"
            aria-label="Idioma"
          >
            <option value="pt-BR">PT-BR</option>
            <option value="en-US">EN-US</option>
            <option value="es-ES">ES-ES</option>
          </select>
        </div>
        <button
          type="button"
          onClick={handleThemeToggle}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-muted hover:text-text"
        >
          {theme === "LIGHT" ? <Sun size={13} /> : <Moon size={13} />}
          <span>{theme === "LIGHT" ? t.themeLight : t.themeDark}</span>
        </button>
      </div>

      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-xl"
      >
        <div className="mb-8">
          <Logo height={32} />
          <div className="mt-3 text-sm text-muted">
            {setup ? t.subtitleSetup : t.subtitleLogin}
          </div>
        </div>

        {setup === null ? (
          <p className="text-sm text-muted">{t.loading}</p>
        ) : (
          <>
            {setup && (
              <>
                <label className={rotulo} htmlFor="chave">
                  {t.installKey}
                </label>
                <input
                  id="chave"
                  type="password"
                  autoFocus
                  value={chave}
                  onChange={(e) => setChave(e.target.value)}
                  className={campo}
                />
                <p className="mt-1 text-xs text-muted">{t.installKeyHint}</p>
                <label className={rotulo} htmlFor="nome">
                  {t.yourName}
                </label>
                <input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className={campo}
                  autoComplete="name"
                />
              </>
            )}
            <label className={rotulo} htmlFor="email">
              {t.email}
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
              {t.password}
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
                  {t.confirmPassword}
                </label>
                <input
                  id="pw2"
                  type="password"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  className={campo}
                  autoComplete="new-password"
                />
                <p className="mt-1 text-xs text-muted">{t.passwordHint}</p>
              </>
            )}
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <button
              disabled={loading || !pronto}
              className="mt-6 w-full rounded-lg bg-brand py-2.5 font-medium text-white transition hover:bg-brand-hover disabled:opacity-50"
            >
              {loading ? t.signingIn : setup ? t.createAdminBtn : t.loginBtn}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
