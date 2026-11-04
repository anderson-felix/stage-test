import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jb-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Stage Hub",
  description: "Plataforma SaaS de Marketing & IA da Stage Consulting",
};

export const instant = false;

const themeInitScript = `
(function() {
  try {
    var m = document.cookie.match(/(?:^|;\\s*)NEXT_THEME=([^;]+)/);
    var pref = m ? decodeURIComponent(m[1]) : "DARK";
    var isLight = pref === "LIGHT" || (pref === "SYSTEM" && window.matchMedia("(prefers-color-scheme: light)").matches);
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(isLight ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", isLight ? "light" : "dark");
    var loc = document.cookie.match(/(?:^|;\\s*)NEXT_LOCALE=([^;]+)/);
    if (loc && loc[1]) document.documentElement.lang = decodeURIComponent(loc[1]);
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const rawTheme = cookieStore.get("NEXT_THEME")?.value || cookieStore.get("theme")?.value || "DARK";
  const isLight = rawTheme === "LIGHT";
  const themeClass = isLight ? "light" : "dark";
  const rawLocale = cookieStore.get("NEXT_LOCALE")?.value || cookieStore.get("locale")?.value || "pt-BR";
  const locale = ["pt-BR", "en-US", "es-ES"].includes(rawLocale) ? rawLocale : "pt-BR";

  return (
    <html
      lang={locale}
      data-theme={themeClass}
      className={`${dmSans.variable} ${mono.variable} ${themeClass} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
