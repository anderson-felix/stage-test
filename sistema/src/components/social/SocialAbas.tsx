import Link from "next/link";
import { BarChart3, Briefcase, CalendarDays, Grid3x3, LayoutGrid } from "lucide-react";

const ABAS = [
  { id: "quadro", href: "/social", label: "Quadro", icon: LayoutGrid },
  { id: "calendario", href: "/social/calendario", label: "Calendário", icon: CalendarDays },
  { id: "instagram", href: "/social/instagram", label: "Instagram", icon: Grid3x3 },
  { id: "linkedin", href: "/social/linkedin", label: "LinkedIn", icon: Briefcase },
] as const;

/** Alterna entre as visões do Social, na ordem do ciclo do post: produzir → agendar → publicado → resultado. */
export function SocialAbas({ atual }: { atual: (typeof ABAS)[number]["id"] }) {
  return (
    <nav className="flex rounded-lg border border-border bg-surface p-0.5">
      {ABAS.map(({ id, href, label, icon: Icone }) => (
        <Link
          key={id}
          href={href}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
            id === atual ? "bg-brand/15 text-brand-soft" : "text-muted hover:text-text"
          }`}
        >
          <Icone size={15} /> {label}
        </Link>
      ))}
      <span
        title="Métricas do Instagram e do LinkedIn (alcance, engajamento, seguidores) quando as contas forem ligadas pelas APIs oficiais"
        className="flex cursor-default items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted opacity-60"
      >
        <BarChart3 size={15} /> Analytics
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">em breve</span>
      </span>
    </nav>
  );
}
