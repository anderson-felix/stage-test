import type { Canal, Formato, Serie, Status } from "@/lib/social";
import { getDictionary, type SupportedLocale } from "@/lib/i18n";

export const STATUS_LABEL: Record<Status, string> = {
  rascunho: "Rascunho",
  aprovado: "Aprovado",
  "em-design": "Em design",
  pronto: "Pronto",
  publicado: "Publicado",
};

/** Ordem das colunas do Quadro (espelha STATUSES de lib/social.ts, que é só de servidor). */
export const STATUS_ORDEM: Status[] = ["rascunho", "aprovado", "em-design", "pronto", "publicado"];

export const STATUS_DOT: Record<Status, string> = {
  rascunho: "bg-muted",
  aprovado: "bg-brand-soft",
  "em-design": "bg-warn",
  pronto: "bg-ok",
  publicado: "bg-brand",
};

export const CANAL_LABEL: Record<Canal, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

export const FORMATO_LABEL: Record<Formato, string> = {
  carrossel: "Carrossel",
  "post-unico": "Post único",
  story: "Story",
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
