"use client";

import { useState, useEffect } from "react";
import { getClientLocale, getDictionary, type SupportedLocale } from "./i18n";

export function useI18n() {
  const [locale, setLocale] = useState<SupportedLocale>("pt-BR");

  useEffect(() => {
    setLocale(getClientLocale());
  }, []);

  return {
    locale,
    dict: getDictionary(locale),
  };
}

