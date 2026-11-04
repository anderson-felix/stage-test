"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, ArrowRight, ArrowLeft, X, Check } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";
import type { SupportedLocale } from "@/lib/i18n";

type TourStep = {
  title: string;
  description: string;
  targetHref: string;
};

const TOUR_STEPS_BY_LOCALE: Record<SupportedLocale, TourStep[]> = {
  "pt-BR": [
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
  ],
  "en-US": [
    {
      title: "1. Overview & AI Credits Governance",
      description:
        "In Overview you track the status of your Landing Pages, captured leads, conversion rate, workspace AI credit balance, and interact with your brand's AI Copilot.",
      targetHref: "/",
    },
    {
      title: "2. Website, Landing Pages & Custom Domains",
      description:
        "In Site & LPs you generate high-converting landing pages with AI, edit HTML manually with zero credit consumption, audit SEO scores, and connect custom domains.",
      targetHref: "/site",
    },
    {
      title: "3. Social Kanban, Calendar & Visual Editor",
      description:
        "In Social you plan content topics, generate carousel and post copy for Instagram and LinkedIn, edit slides in the Visual Editor, and publish or schedule via OAuth.",
      targetHref: "/social",
    },
    {
      title: "4. Google Ads Traffic & Lead Pipeline",
      description:
        "In Traffic & Leads you build complete campaigns ready for Google Ads Editor and monitor leads captured in real time with UTM sources and email delivery statuses.",
      targetHref: "/leads",
    },
    {
      title: "5. Brand Library & Smart Briefings",
      description:
        "In Library & AI you manage brand logos, visual references, and generated assets. When creating pieces, customize tone, language, and attach reference images!",
      targetHref: "/claude",
    },
  ],
  "es-ES": [
    {
      title: "1. Visión General y Gobernanza de Créditos IA",
      description:
        "En Visión General supervisa el estado de sus Landing Pages, leads capturados, tasa de conversión, saldo de créditos de IA del workspace y conversa con el Copiloto de su marca.",
      targetHref: "/",
    },
    {
      title: "2. Sitio Web, Landing Pages y Dominios Propios",
      description:
        "En Sitio y LPs genere páginas de alta conversión con IA, edite HTML manualmente sin gastar créditos, audite SEO y conecte subdominios propios.",
      targetHref: "/site",
    },
    {
      title: "3. Kanban Social, Calendario y Editor Visual",
      description:
        "En Social planifique temas editoriales, genere copys de carruseles para Instagram y LinkedIn, edite diapositivas en el Editor Visual y programe publicaciones por OAuth.",
      targetHref: "/social",
    },
    {
      title: "4. Tráfico de Google Ads y Pipeline de Leads",
      description:
        "En Tráfico y Leads estructure campañas completas para Google Ads Editor y consulte leads capturados en tiempo real con datos UTM y estado de entrega de correo.",
      targetHref: "/leads",
    },
    {
      title: "5. Biblioteca de Marca y Briefings Inteligentes",
      description:
        "En Biblioteca e IA organice logotipos, referencias visuales y activos. Al crear cualquier contenido, elija el tono, idioma y adjunte imágenes de referencia.",
      targetHref: "/claude",
    },
  ],
};

const UI_TEXT = {
  "pt-BR": {
    badge: "Tour Guiado",
    step: "Passo",
    of: "de",
    close: "Fechar tour",
    skip: "Pular tour",
    prev: "Anterior",
    next: "Próximo",
    finish: "Concluir Tour",
  },
  "en-US": {
    badge: "Guided Tour",
    step: "Step",
    of: "of",
    close: "Close tour",
    skip: "Skip tour",
    prev: "Previous",
    next: "Next",
    finish: "Finish Tour",
  },
  "es-ES": {
    badge: "Tour Guiado",
    step: "Paso",
    of: "de",
    close: "Cerrar tour",
    skip: "Saltar tour",
    prev: "Anterior",
    next: "Siguiente",
    finish: "Finalizar Tour",
  },
};

export function GuidedTour() {
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    let active = true;

    // Se já foi concluído localmente, não exibe
    if (typeof window !== "undefined" && localStorage.getItem("stage_tour_completed") === "1") {
      return;
    }

    Promise.all([
      fetch("/api/status").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/conta").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([statusData, contaData]) => {
        if (!active) return;
        const onboardingCompleted = Boolean(
          statusData?.tenant?.onboardingCompleted || contaData?.onboardingCompleted
        );
        const completedTour = Boolean(
          statusData?.completedTour || contaData?.completedTour
        );

        if (completedTour) {
          if (typeof window !== "undefined") {
            localStorage.setItem("stage_tour_completed", "1");
          }
          return;
        }

        if (!onboardingCompleted && !pathname.startsWith("/onboarding") && !pathname.startsWith("/admin")) {
          router.replace("/onboarding");
          return;
        }

        if (onboardingCompleted && !completedTour && !pathname.startsWith("/onboarding")) {
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
    if (typeof window !== "undefined") {
      localStorage.setItem("stage_tour_completed", "1");
    }
    try {
      await fetch("/api/conta", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedTour: true }),
      });
    } catch {
      // ignore
    }
  }

  if (!open) return null;

  const currentSteps = TOUR_STEPS_BY_LOCALE[locale] ?? TOUR_STEPS_BY_LOCALE["pt-BR"];
  const ui = UI_TEXT[locale] ?? UI_TEXT["pt-BR"];
  const current = currentSteps[stepIdx] ?? currentSteps[0];
  const isLast = stepIdx === currentSteps.length - 1;

  return (
    <div className="fixed bottom-5 right-5 z-50 w-full max-w-md rounded-2xl border border-brand/40 bg-surface text-text p-5 shadow-2xl transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-soft">
          <Sparkles size={14} /> {ui.badge} · {ui.step} {stepIdx + 1} {ui.of} {currentSteps.length}
        </div>
        <button
          onClick={finishTour}
          className="text-muted hover:text-text p-1 transition"
          title={ui.skip}
          aria-label={ui.close}
        >
          <X size={16} />
        </button>
      </div>

      <h3 className="mt-2.5 font-semibold text-text text-base">{current.title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{current.description}</p>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-3">
        <button
          onClick={finishTour}
          className="text-xs text-muted hover:text-text font-medium transition"
        >
          {ui.skip}
        </button>

        <div className="flex items-center gap-2">
          {stepIdx > 0 && (
            <button
              onClick={() => setStepIdx((i) => i - 1)}
              className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-muted hover:text-text transition"
            >
              <ArrowLeft size={12} /> {ui.prev}
            </button>
          )}
          {!isLast ? (
            <button
              onClick={() => setStepIdx((i) => i + 1)}
              className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover shadow-sm transition"
            >
              {ui.next} <ArrowRight size={12} />
            </button>
          ) : (
            <button
              onClick={finishTour}
              className="flex items-center gap-1 rounded-lg bg-ok px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90 shadow-sm transition"
            >
              <Check size={12} /> {ui.finish}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
