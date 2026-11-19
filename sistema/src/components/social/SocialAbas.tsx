"use client";

import Link from "next/link";
import { BarChart3, Briefcase, CalendarDays, Grid3x3, LayoutGrid } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

type AbaId = "quadro" | "calendario" | "instagram" | "linkedin";

/** Alterna entre as visões do Social, na ordem do ciclo do post: produzir → agendar → publicado → resultado. */
export function SocialAbas({ atual }: { atual: AbaId }) {
  const { dict } = useI18n();

  const abas = [
    { id: "quadro", href: "/social", label: dict.social.tabBoard || "Quadro", icon: LayoutGrid },
    { id: "calendario", href: "/social/calendario", label: dict.social.tabCalendar || "Calendário", icon: CalendarDays },
    { id: "instagram", href: "/social/instagram", label: dict.social.tabInstagram || "Instagram", icon: Grid3x3 },
    { id: "linkedin", href: "/social/linkedin", label: dict.social.tabLinkedIn || "LinkedIn", icon: Briefcase },
  ] as const;

  return (
    <nav className="flex flex-nowrap max-w-full overflow-x-auto rounded-lg border border-border bg-surface p-0.5 scrollbar-thin">
      {abas.map(({ id, href, label, icon: Icone }) => (
        <Link
          key={id}
          href={href}
          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition ${
            id === atual ? "bg-brand/15 text-brand-soft" : "text-muted hover:text-text"
          }`}
        >
          <Icone size={15} /> {label}
        </Link>
      ))}
      <span
        title="Métricas do Instagram e do LinkedIn (alcance, engajamento, seguidores) sincronizadas via OAuth"
        className="flex shrink-0 cursor-default items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted opacity-60"
      >
        <BarChart3 size={15} /> {dict.social.tabAnalytics || "Analytics"}
      </span>
    </nav>
  );
}
