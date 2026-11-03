"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Globe, Share2, Clapperboard, TrendingUp, TerminalSquare, LogOut, Users, UserRound } from "lucide-react";
import type { UsuarioPublico } from "@/lib/usuarios";
import { Logo } from "./Logo";

const TABS: { href: string; label: string; icon: typeof LayoutGrid; emBreve?: boolean }[] = [
  { href: "/", label: "Visão Geral", icon: LayoutGrid },
  { href: "/site", label: "Site & LPs", icon: Globe },
  { href: "/social", label: "Social", icon: Share2 },
  { href: "/estudio", label: "Estúdio", icon: Clapperboard, emBreve: true },
  { href: "/leads", label: "Tráfego & Leads", icon: TrendingUp },
  { href: "/claude", label: "Claude Code", icon: TerminalSquare },
];

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export function TopNav() {
  const pathname = usePathname();
  const [eu, setEu] = useState<UsuarioPublico | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/conta")
      .then((r) => (r.ok ? r.json() : null))
      .then(setEu)
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

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-6 border-b border-border bg-bg/90 px-4 backdrop-blur">
      <Link href="/" className="flex shrink-0 items-center gap-2">
        <Logo height={22} />
      </Link>
      <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {TABS.map(({ href, label, icon: Icon, emBreve }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition ${
                active ? "bg-brand/15 text-brand-soft" : "text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              <Icon size={15} />
              {label}
              {emBreve && (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted">em breve</span>
              )}
            </Link>
          );
        })}
      </nav>

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
          <div className="absolute right-0 top-full mt-1 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 text-sm shadow-2xl">
            {eu && (
              <div className="border-b border-border px-3 py-2">
                <div className="truncate font-medium">{eu.nome}</div>
                <div className="truncate text-xs text-muted">{eu.email}</div>
              </div>
            )}
            <Link href="/conta" onClick={() => setMenu(false)} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2">
              <UserRound size={14} /> Minha conta
            </Link>
            {eu?.papel === "admin" && (
              <Link href="/usuarios" onClick={() => setMenu(false)} className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2">
                <Users size={14} /> Usuários
              </Link>
            )}
            <button onClick={logout} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2">
              <LogOut size={14} /> Sair
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/** Mesmo tamanho do TopNav, enquanto ele carrega (o usePathname precisa de <Suspense> no Next 16). */
export function TopNavEsqueleto() {
  return <header className="sticky top-0 z-20 h-14 border-b border-border bg-bg/90" />;
}
