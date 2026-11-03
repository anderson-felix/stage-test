"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, ArrowRight, ArrowLeft, X, Check } from "lucide-react";
import type { UsuarioPublico } from "@/lib/usuarios";

const TOUR_STEPS = [
  {
    title: "1. Visão Geral & Governança de Créditos IA",
    description:
      "Na Visão Geral você acompanha o status das suas Landing Pages, leads capturados, taxa de conversão, saldo de créditos de IA do workspace e conversa com o Copiloto da sua marca.",
    targetHref: "/",
  },
  {
    title: "2. Site, Landing Pages & Domínios Próprios",
    description:
      "Em Site & LPs você gera Landing Pages de alta conversão com IA, edita o HTML manualmente sem consumir créditos, audita o Score de SEO e conecta seu subdomínio próprio.",
    targetHref: "/site",
  },
  {
    title: "3. Social Kanban, Calendário & Editor Visual",
    description:
      "No módulo Social você planeja Pautas, gera roteiros de carrosséis e posts para Instagram e LinkedIn, edita os slides no Editor Visual e publica ou agenda via OAuth.",
    targetHref: "/social",
  },
  {
    title: "4. Tráfego Google Ads & Esteira de Leads",
    description:
      "Em Tráfego & Leads você estrutura campanhas completas para o Google Ads Editor e acompanha em tempo real todos os leads capturados com origem UTM e status de e-mail.",
    targetHref: "/leads",
  },
  {
    title: "5. Biblioteca da Marca & Briefings Inteligentes",
    description:
      "Na Biblioteca & IA você organiza logos, referências visuais e slides gerados. Ao criar qualquer peça, escolha o Tom, Idioma (pt-BR, en-US, es-ES) e anexe uma imagem de referência!",
    targetHref: "/claude",
  },
];

export function GuidedTour() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UsuarioPublico | null>(null);
  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/conta")
      .then((r) => (r.ok ? r.json() : null))
      .then((u: UsuarioPublico | null) => {
        if (!active || !u) return;
        setUser(u);
        if (!u.onboardingCompleted && !pathname.startsWith("/onboarding") && !pathname.startsWith("/admin")) {
          router.replace("/onboarding");
          return;
        }
        if (u.onboardingCompleted && !u.completedTour && !pathname.startsWith("/onboarding")) {
          setOpen(true);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pathname, router]);

  async function finishTour() {
    setOpen(false);
    try {
      await fetch("/api/conta", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedTour: true }),
      });
      if (user) setUser({ ...user, completedTour: true });
    } catch {
      // ignore
    }
  }

  if (!open) return null;

  const current = TOUR_STEPS[stepIdx]!;
  const isLast = stepIdx === TOUR_STEPS.length - 1;

  return (
    <div className="fixed bottom-5 right-5 z-50 w-full max-w-md rounded-2xl border border-brand/50 bg-surface p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-soft">
          <Sparkles size={14} /> Tour Guiado · Passo {stepIdx + 1} de {TOUR_STEPS.length}
        </div>
        <button
          onClick={finishTour}
          className="text-muted hover:text-text"
          title="Pular tour"
          aria-label="Fechar tour"
        >
          <X size={16} />
        </button>
      </div>

      <h3 className="mt-2 font-semibold text-text">{current.title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">{current.description}</p>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <button
          onClick={finishTour}
          className="text-xs text-muted hover:text-text"
        >
          Pular tour
        </button>

        <div className="flex items-center gap-2">
          {stepIdx > 0 && (
            <button
              onClick={() => setStepIdx((i) => i - 1)}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:text-text"
            >
              <ArrowLeft size={12} /> Anterior
            </button>
          )}
          {!isLast ? (
            <button
              onClick={() => setStepIdx((i) => i + 1)}
              className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover"
            >
              Próximo <ArrowRight size={12} />
            </button>
          ) : (
            <button
              onClick={finishTour}
              className="flex items-center gap-1 rounded-lg bg-ok px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90"
            >
              <Check size={12} /> Concluir Tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

