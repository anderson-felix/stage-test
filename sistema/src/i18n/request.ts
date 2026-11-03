import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { DICTIONARIES, normalizeLocale } from "@/lib/i18n";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const rawLocale =
    cookieStore.get("NEXT_LOCALE")?.value ||
    headerStore.get("x-locale") ||
    "pt-BR";
  const locale = normalizeLocale(rawLocale);

  return {
    locale,
    messages: DICTIONARIES[locale],
  };
});

