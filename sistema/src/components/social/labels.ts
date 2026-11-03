import type { Canal, Formato, Serie, Status } from "@/lib/social";

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

/** 2026-10-14 → 14/out */
export function formatarData(iso: string): string {
  const [, m, d] = iso.split("-");
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${Number(d)}/${meses[Number(m) - 1]}`;
}
