import type { Canal, Formato, Serie, Status } from "@/lib/social";
import { getDictionary, type SupportedLocale } from "@/lib/i18n";

export const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  IDEA: "Ideia / Rascunho",
  roteiro: "Roteiro",
  SCRIPT_REVIEW: "Roteiro em Revisão",
  arte: "Arte em Design",
  "em-design": "Em Design",
  DESIGN: "Design",
  aprovado: "Aprovado",
  APPROVED: "Aprovado",
  pronto: "Pronto",
  agendado: "Agendado",
  SCHEDULED: "Agendado",
  publicado: "Publicado",
  PUBLISHED: "Publicado",
};

/** Ordem das colunas do Quadro */
export const STATUS_ORDEM: Status[] = ["rascunho", "aprovado", "em-design", "pronto", "publicado"];

export const STATUS_DOT: Record<string, string> = {
  rascunho: "bg-muted",
  IDEA: "bg-muted",
  roteiro: "bg-warn",
  SCRIPT_REVIEW: "bg-warn",
  arte: "bg-warn",
  "em-design": "bg-warn",
  DESIGN: "bg-warn",
  aprovado: "bg-brand-soft",
  APPROVED: "bg-brand-soft",
  pronto: "bg-ok",
  agendado: "bg-brand",
  SCHEDULED: "bg-brand",
  publicado: "bg-ok",
  PUBLISHED: "bg-ok",
};

export const STATUS_COR: Record<string, string> = {
  rascunho: "bg-surface-2 text-muted border-border",
  IDEA: "bg-surface-2 text-muted border-border",
  roteiro: "bg-warn/15 text-warn border-warn/30",
  SCRIPT_REVIEW: "bg-warn/15 text-warn border-warn/30",
  arte: "bg-warn/15 text-warn border-warn/30",
  "em-design": "bg-warn/15 text-warn border-warn/30",
  DESIGN: "bg-warn/15 text-warn border-warn/30",
  aprovado: "bg-brand/15 text-brand-soft border-brand/30",
  APPROVED: "bg-brand/15 text-brand-soft border-brand/30",
  pronto: "bg-ok/15 text-ok border-ok/30",
  agendado: "bg-brand/20 text-brand border-brand/40",
  SCHEDULED: "bg-brand/20 text-brand border-brand/40",
  publicado: "bg-ok/20 text-ok border-ok/40",
  PUBLISHED: "bg-ok/20 text-ok border-ok/40",
};

export const CANAL_LABEL: Record<Canal, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

export const FORMATO_LABEL: Record<Formato, string> = {
  carrossel: "Carrossel",
  "post-unico": "Post único",
  story: "Story",
  video: "Vídeo / Reels",
};

export const SERIE_LABEL: Record<Serie, string> = {
  "cultura-em-acao": "Cultura em ação",
  dado: "Dado",
  "na-midia": "Na mídia",
  socios: "Sócios",
  evento: "Evento",
  conteudo: "Conteúdo",
};

export function getSocialLabels(locale: SupportedLocale = "pt-BR") {
  const dict = getDictionary(locale);
  return {
    status: {
      rascunho: dict.social.statusDraft,
      aprovado: dict.social.statusApproved,
      "em-design": dict.social.statusDesign,
      pronto: dict.social.statusReady,
      publicado: dict.social.statusPublished,
    } satisfies Record<Status, string>,
    formato: {
      carrossel: dict.social.formatCarousel,
      "post-unico": dict.social.formatSingle,
      story: dict.social.formatStory,
      video: dict.social.formatVideo,
    } satisfies Record<Formato, string>,
    serie: {
      "cultura-em-acao": dict.social.seriesCulture,
      dado: dict.social.seriesData,
      "na-midia": dict.social.seriesPress,
      socios: dict.social.seriesPartners,
      evento: dict.social.seriesEvent,
      conteudo: dict.social.seriesContent,
    } satisfies Record<Serie, string>,
  };
}

export function getLocalizedStatusSocialLabel(status: string, dict: ReturnType<typeof getDictionary>): string {
  const map: Record<string, string> = {
    rascunho: dict.social.statusDraft,
    IDEA: dict.social.statusIdea,
    roteiro: dict.social.statusScript,
    SCRIPT_REVIEW: dict.social.statusScriptReview,
    arte: dict.social.statusDesignArt,
    "em-design": dict.social.statusDesign,
    DESIGN: dict.social.statusDesign,
    aprovado: dict.social.statusApproved,
    APPROVED: dict.social.statusApproved,
    pronto: dict.social.statusReady,
    agendado: dict.social.statusScheduled,
    SCHEDULED: dict.social.statusScheduled,
    publicado: dict.social.statusPublished,
    PUBLISHED: dict.social.statusPublished,
  };
  return map[status] ?? STATUS_LABEL[status] ?? status;
}

export function getLocalizedFormatSocialLabel(formato: Formato, dict: ReturnType<typeof getDictionary>): string {
  const map: Record<Formato, string> = {
    carrossel: dict.social.formatCarousel,
    "post-unico": dict.social.formatSingle,
    story: dict.social.formatStory,
    video: dict.social.formatVideo,
  };
  return map[formato] ?? FORMATO_LABEL[formato] ?? formato;
}

export function getLocalizedToneSocialOptions(dict: ReturnType<typeof getDictionary>) {
  return [
    { value: "", label: dict.social.toneBrand },
    { value: "Consultivo", label: dict.social.toneConsultative },
    { value: "Direto", label: dict.social.toneDirect },
    { value: "Provocativo", label: dict.social.toneProvocative },
    { value: "Educativo", label: dict.social.toneEducational },
    { value: "Formal", label: dict.social.toneFormal },
  ];
}

/** 2026-10-14 → 14/out */
export function formatarData(iso: string, locale: SupportedLocale = "pt-BR"): string {
  const [, m, d] = iso.split("-");
  const mesesMap: Record<SupportedLocale, string[]> = {
    "pt-BR": ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
    "en-US": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    "es-ES": ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  };
  const meses = mesesMap[locale] ?? mesesMap["pt-BR"];
  return `${Number(d)}/${meses[Number(m) - 1]}`;
}
