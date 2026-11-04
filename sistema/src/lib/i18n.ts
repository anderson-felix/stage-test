import ptBR from "../../messages/pt-BR.json";
import enUS from "../../messages/en-US.json";
import esES from "../../messages/es-ES.json";

export type SupportedLocale = "pt-BR" | "en-US" | "es-ES";

export const SUPPORTED_LOCALES: SupportedLocale[] = ["pt-BR", "en-US", "es-ES"];

export const DICTIONARIES: Record<SupportedLocale, typeof ptBR> = {
  "pt-BR": ptBR,
  "en-US": enUS,
  "es-ES": esES,
};

export function normalizeLocale(loc?: string | null): SupportedLocale {
  if (!loc) return "pt-BR";
  const lower = loc.toLowerCase();
  if (lower.startsWith("en")) return "en-US";
  if (lower.startsWith("es")) return "es-ES";
  return "pt-BR";
}

export function getDictionary(loc?: string | null) {
  return DICTIONARIES[normalizeLocale(loc)];
}

export function getClientLocale(): SupportedLocale {
  if (typeof document === "undefined") return "pt-BR";
  const cookieMatch = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  if (cookieMatch?.[1]) {
    return normalizeLocale(decodeURIComponent(cookieMatch[1]));
  }
  return normalizeLocale(document.documentElement.lang);
}
