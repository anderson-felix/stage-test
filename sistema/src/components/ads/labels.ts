import type { Servico, StatusCampanha } from "@/lib/ads";
import type { FinalidadeLP, StatusLP } from "@/lib/lp";
import { getDictionary, type SupportedLocale } from "@/lib/i18n";

/** Finalidade da LP: com ou sem Campanha de tráfego pago. */
export const FINALIDADE_LP_OPCOES: { valor: FinalidadeLP; label: string; descricao: string }[] = [
  { valor: "campanha", label: "Campanha de Ads", descricao: "Recebe o clique do anúncio: repete a promessa da Campanha e foca no formulário." },
  { valor: "site", label: "Página do site", descricao: "Matéria ou página de conteúdo, sem Campanha: aparece no Google e termina num convite ao contato." },
];

export const SERVICO_LABEL: Record<Servico, string> = {
  technology: "Technology",
  "strategy-business": "Strategy & Business",
  "experience-design": "Experience Design",
  "people-development": "People Development",
  institucional: "Institucional",
};

/** Espelha SERVICOS de lib/ads.ts (que é só de servidor). */
export const SERVICOS_ORDEM: Servico[] = ["technology", "strategy-business", "experience-design", "people-development", "institucional"];

export const STATUS_CAMPANHA_ORDEM: StatusCampanha[] = ["rascunho", "pronta", "ativa", "encerrada"];

export const STATUS_CAMPANHA_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  DRAFT: "Rascunho",
  em_revisao: "Em revisão",
  pronta: "Pronta para importar",
  ativa: "Ativa no Google Ads",
  publicada: "Publicada",
  PUBLISHED: "Publicada",
  encerrada: "Encerrada",
  ARCHIVED: "Arquivada",
};

export const STATUS_CAMPANHA_COR: Record<string, string> = {
  rascunho: "bg-surface-2 text-muted border-border",
  DRAFT: "bg-surface-2 text-muted border-border",
  em_revisao: "bg-warn/15 text-warn border-warn/30",
  pronta: "bg-brand/15 text-brand-soft border-brand/30",
  ativa: "bg-ok/15 text-ok border-ok/30",
  publicada: "bg-ok/15 text-ok border-ok/30",
  PUBLISHED: "bg-ok/15 text-ok border-ok/30",
  encerrada: "bg-surface-2 text-muted line-through border-border",
  ARCHIVED: "bg-surface-2 text-muted line-through border-border",
};

export const STATUS_LP_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  DRAFT: "Rascunho",
  aprovada: "Aprovada",
  publicada: "Publicada",
  PUBLISHED: "Publicada",
  ARCHIVED: "Arquivada",
};

export const STATUS_LP_COR: Record<string, string> = {
  rascunho: "bg-surface-2 text-muted border-border",
  DRAFT: "bg-surface-2 text-muted border-border",
  aprovada: "bg-brand/15 text-brand-soft border-brand/30",
  publicada: "bg-ok/15 text-ok border-ok/30",
  PUBLISHED: "bg-ok/15 text-ok border-ok/30",
  ARCHIVED: "bg-surface-2 text-muted line-through border-border",
};

export function getAdsLabels(locale: SupportedLocale = "pt-BR") {
  const dict = getDictionary(locale);
  return {
    finalidadeOpcoes: [
      { valor: "campanha" as FinalidadeLP, label: dict.ads.purposeCampaign, descricao: dict.ads.purposeCampaignDesc },
      { valor: "site" as FinalidadeLP, label: dict.ads.purposeSite, descricao: dict.ads.purposeSiteDesc },
    ],
    statusCampanha: {
      rascunho: dict.ads.statusDraft,
      pronta: dict.ads.statusReady,
      ativa: dict.ads.statusActive,
      encerrada: dict.ads.statusEnded,
    } satisfies Record<StatusCampanha, string>,
  };
}

export function getLocalizedFinalidadeOpcoes(dict: ReturnType<typeof getDictionary>): { valor: FinalidadeLP; label: string; descricao: string }[] {
  return [
    { valor: "campanha", label: dict.ads.purposeCampaign, descricao: dict.ads.purposeCampaignDesc },
    { valor: "site", label: dict.ads.purposeSite, descricao: dict.ads.purposeSiteDesc },
  ];
}

export function getLocalizedStatusLpLabel(status: string, dict: ReturnType<typeof getDictionary>): string {
  const map: Record<string, string> = {
    rascunho: dict.ads.statusDraft,
    DRAFT: dict.ads.statusDraft,
    aprovada: dict.ads.statusApproved,
    publicada: dict.ads.statusPublished,
    PUBLISHED: dict.ads.statusPublished,
    ARCHIVED: dict.ads.statusArchived,
  };
  return map[status] ?? STATUS_LP_LABEL[status] ?? status;
}

export function getLocalizedStatusCampanhaLabel(status: string, dict: ReturnType<typeof getDictionary>): string {
  const map: Record<string, string> = {
    rascunho: dict.ads.statusDraft,
    DRAFT: dict.ads.statusDraft,
    em_revisao: dict.ads.statusReview,
    pronta: dict.ads.statusReady,
    ativa: dict.ads.statusActive,
    publicada: dict.ads.statusPublished,
    PUBLISHED: dict.ads.statusPublished,
    encerrada: dict.ads.statusEnded,
    ARCHIVED: dict.ads.statusArchived,
  };
  return map[status] ?? STATUS_CAMPANHA_LABEL[status] ?? status;
}

export function getLocalizedToneOptions(dict: ReturnType<typeof getDictionary>) {
  return [
    { value: "", label: dict.ads.toneBrand },
    { value: "Consultivo", label: dict.ads.toneConsultative },
    { value: "Direto", label: dict.ads.toneDirect },
    { value: "Provocativo", label: dict.ads.toneProvocative },
    { value: "Educativo", label: dict.ads.toneEducational },
    { value: "Formal", label: dict.ads.toneFormal },
  ];
}

export const fmtNum = (n: number | null, locale: SupportedLocale = "pt-BR") => (n === null ? "—" : n.toLocaleString(locale));
export const fmtBRL = (n: number | null, locale: SupportedLocale = "pt-BR") =>
  n === null ? "—" : n.toLocaleString(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
