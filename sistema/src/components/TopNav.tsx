"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid,
  Globe,
  Share2,
  Clapperboard,
  TrendingUp,
  FolderOpen,
  LogOut,
  Users,
  UserRound,
  ShieldAlert,
  Building2,
  Sun,
  Moon,
  Monitor,
  Languages,
} from "lucide-react";
import type { UsuarioPublico } from "@/lib/usuarios";
import { getDictionary, normalizeLocale, type SupportedLocale } from "@/lib/i18n";
import { Logo } from "./Logo";

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

function applyDomTheme(pref: "LIGHT" | "DARK" | "SYSTEM") {
  if (typeof document === "undefined") return;
  const isLight =
    pref === "LIGHT" ||
    (pref === "SYSTEM" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.classList.add(isLight ? "light" : "dark");
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [eu, setEu] = useState<UsuarioPublico | null>(null);
  const [locale, setLocale] = useState<SupportedLocale>("pt-BR");
  const [theme, setTheme] = useState<"LIGHT" | "DARK" | "SYSTEM">("DARK");
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/conta")
      .then((r) => (r.ok ? r.json() : null))
      .then((u: UsuarioPublico | null) => {
        if (!u) return;
        setEu(u);
        const loc = normalizeLocale(u.preferredLocale);
        setLocale(loc);
        document.documentElement.lang = loc;
        const thm = u.themePreference || "DARK";
        setTheme(thm);
        applyDomTheme(thm);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [menu]);

  async function updatePreferences(next: {
    preferredLocale?: SupportedLocale;
    themePreference?: "LIGHT" | "DARK" | "SYSTEM";
  }) {
    if (next.preferredLocale) {
      setLocale(next.preferredLocale);
      document.documentElement.lang = next.preferredLocale;
      document.cookie = `NEXT_LOCALE=${encodeURIComponent(next.preferredLocale)}; path=/; max-age=31536000`;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("stage:locale-change", { detail: next.preferredLocale }));
      }
    }
    if (next.themePreference) {
      setTheme(next.themePreference);
      applyDomTheme(next.themePreference);
      document.cookie = `NEXT_THEME=${encodeURIComponent(next.themePreference)}; path=/; max-age=31536000`;
    }
    await fetch("/api/conta", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => undefined);
    router.refresh();
  }

  async function switchTenant(targetTenantId: string) {
    if (!targetTenantId || targetTenantId === eu?.tenantId) return;
    const res = await fetch("/api/conta", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ switchTenantId: targetTenantId }),
    });
    if (res.ok) {
      const updated = (await res.json()) as UsuarioPublico;
      setEu(updated);
      window.location.reload();
    }
  }

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  async function sairModoCliente() {
    const res = await fetch("/api/admin/impersonate", { method: "DELETE" });
    if (res.ok) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/admin/tenants");
    }
  }

  const dict = getDictionary(locale);

  const TABS: { href: string; label: string; icon: typeof LayoutGrid }[] = [
    { href: "/", label: dict.nav.overview, icon: LayoutGrid },
    { href: "/site", label: dict.nav.site, icon: Globe },
    { href: "/social", label: dict.nav.social, icon: Share2 },
    { href: "/estudio", label: dict.nav.studio, icon: Clapperboard },
    { href: "/leads", label: dict.nav.leads, icon: TrendingUp },
    { href: "/claude", label: dict.nav.library, icon: FolderOpen },
  ];

  const isImpersonating = Boolean(eu?.impersonating || eu?.impersonation);
  const impersonatedClientName = eu?.impersonation?.tenantName || eu?.tenantName || "";

  return (
    <div className="sticky top-0 z-20 flex flex-col">
      {isImpersonating && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-warn/20 px-4 py-1.5 text-xs text-warn backdrop-blur">
          <div className="flex items-center gap-2 font-medium">
            <ShieldAlert size={14} />
            <span>
              Modo Suporte Ativo: Visualizando como <strong>{impersonatedClientName}</strong>
            </span>
          </div>
          <button
            onClick={sairModoCliente}
            className="rounded-md bg-warn px-2.5 py-0.5 text-[11px] font-semibold text-black hover:opacity-90"
          >
            Encerrar Suporte (Voltar ao Admin)
          </button>
        </div>
      )}

      <header className="flex h-14 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur md:gap-5">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Logo height={22} />
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
                  active ? "bg-brand/15 text-brand-soft" : "text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                <Icon size={15} />
                <span>{label}</span>
              </Link>
            );
          })}
          {eu?.isSuperAdmin && (
            <Link
              href="/admin/tenants"
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
                pathname.startsWith("/admin")
                  ? "bg-brand/15 text-brand-soft"
                  : "text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              <Building2 size={15} />
              <span>{dict.nav.superAdmin}</span>
            </Link>
          )}
        </nav>

        {/* Seletor rápido de empresa para usuários em múltiplos tenants */}
        {eu?.memberships && eu.memberships.length > 1 && (
          <div className="hidden items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs md:flex">
            <Building2 size={13} className="text-brand-soft" />
            <select
              value={eu.tenantId}
              onChange={(e) => void switchTenant(e.target.value)}
              className="max-w-40 truncate bg-transparent text-xs font-medium text-text outline-none"
              aria-label="Selecionar empresa"
            >
              {eu.memberships.map((m) => (
                <option key={m.tenantId} value={m.tenantId}>
                  {m.tenantName} ({m.role})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Seletor rápido de Idioma da Interface e Tema */}
        <div className="hidden items-center gap-1.5 sm:flex">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs">
            <Languages size={13} className="text-muted" />
            <select
              value={locale}
              onChange={(e) => updatePreferences({ preferredLocale: e.target.value as SupportedLocale })}
              className="bg-transparent text-xs font-medium text-text outline-none"
              aria-label="Idioma da interface"
            >
              <option value="pt-BR">PT-BR</option>
              <option value="en-US">EN-US</option>
              <option value="es-ES">ES-ES</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => updatePreferences({ themePreference: theme === "LIGHT" ? "DARK" : "LIGHT" })}
            title={theme === "LIGHT" ? dict.nav.themeDark : dict.nav.themeLight}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:text-text"
            aria-label="Alternar tema claro/escuro"
          >
            {theme === "LIGHT" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>

        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setMenu((m) => !m)}
            title={eu ? `${eu.nome} (${eu.email})` : "Conta"}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">
              {eu ? iniciais(eu.nome) : <UserRound size={14} />}
            </span>
            <span className="hidden max-w-32 truncate md:inline">{eu?.nome.split(" ")[0]}</span>
          </button>
          {menu && (
            <div className="absolute right-0 top-full mt-1 w-64 overflow-hidden rounded-xl border border-border bg-surface py-1 text-sm shadow-2xl">
              {eu && (
                <div className="border-b border-border px-3 py-2">
                  <div className="truncate font-medium">{eu.nome}</div>
                  <div className="truncate text-xs text-muted">{eu.email}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-brand-soft">
                    <span>{eu.tenantName}</span>
                    <span>·</span>
                    <span className="uppercase">{eu.role}</span>
                  </div>
                </div>
              )}

              {eu?.memberships && eu.memberships.length > 1 && (
                <div className="border-b border-border px-3 py-2 md:hidden">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Empresa ativa
                  </div>
                  <select
                    value={eu.tenantId}
                    onChange={(e) => void switchTenant(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text outline-none"
                  >
                    {eu.memberships.map((m) => (
                      <option key={m.tenantId} value={m.tenantId}>
                        {m.tenantName} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="border-b border-border px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Tema & Idioma</div>
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  {(["LIGHT", "DARK", "SYSTEM"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => updatePreferences({ themePreference: t })}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] ${
                        theme === t ? "bg-brand text-white" : "bg-surface-2 text-muted hover:text-text"
                      }`}
                    >
                      {t === "LIGHT" ? <Sun size={11} /> : t === "DARK" ? <Moon size={11} /> : <Monitor size={11} />}
                      {t === "LIGHT" ? dict.nav.themeLight : t === "DARK" ? dict.nav.themeDark : dict.nav.themeSystem}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 flex items-center gap-1">
                  {(["pt-BR", "en-US", "es-ES"] as const).map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => updatePreferences({ preferredLocale: loc })}
                      className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium ${
                        locale === loc ? "bg-brand/15 text-brand-soft" : "bg-surface-2 text-muted hover:text-text"
                      }`}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </div>

              <Link href="/conta" onClick={() => setMenu(false)} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2">
                <UserRound size={14} /> {dict.nav.myAccount}
              </Link>
              {eu?.papel === "admin" && (
                <Link href="/usuarios" onClick={() => setMenu(false)} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2">
                  <Users size={14} /> {dict.nav.members}
                </Link>
              )}
              {eu?.isSuperAdmin && (
                <Link
                  href="/admin/tenants"
                  onClick={() => setMenu(false)}
                  className="flex items-center gap-2 px-3 py-2 text-brand-soft hover:bg-surface-2"
                >
                  <Building2 size={14} /> {dict.nav.adminPanel}
                </Link>
              )}
              <button onClick={logout} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2">
                <LogOut size={14} /> {dict.nav.logout}
              </button>
            </div>
          )}
        </div>
      </header>
    </div>
  );
}

/** Mesmo tamanho do TopNav, enquanto ele carrega (o usePathname precisa de <Suspense> no Next 16). */
export function TopNavEsqueleto() {
  return <header className="sticky top-0 z-20 h-14 border-b border-border bg-bg/90" />;
}
