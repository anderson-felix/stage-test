import type { Servico, StatusCampanha } from "@/lib/ads";
import type { FinalidadeLP } from "@/lib/lp";

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

export const STATUS_CAMPANHA_LABEL: Record<StatusCampanha, string> = {
  rascunho: "Rascunho",
  pronta: "Pronta para importar",
  ativa: "Ativa no Google Ads",
  encerrada: "Encerrada",
};

export const STATUS_CAMPANHA_COR: Record<StatusCampanha, string> = {
  rascunho: "bg-surface-2 text-muted",
  pronta: "bg-brand/15 text-brand-soft",
  ativa: "bg-ok/15 text-ok",
  encerrada: "bg-surface-2 text-muted line-through",
};

export const fmtNum = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR"));
export const fmtBRL = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
