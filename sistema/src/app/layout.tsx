import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jb-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Stage Hub",
  description: "Plataforma SaaS de Marketing & IA da Stage Consulting",
};

const themeInitScript = `
(function() {
  try {
    var m = document.cookie.match(/(?:^|;\\s*)NEXT_THEME=([^;]+)/);
    var pref = m ? decodeURIComponent(m[1]) : "DARK";
    var isLight = pref === "LIGHT" || (pref === "SYSTEM" && window.matchMedia("(prefers-color-scheme: light)").matches);
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(isLight ? "light" : "dark");
    var loc = document.cookie.match(/(?:^|;\\s*)NEXT_LOCALE=([^;]+)/);
    if (loc && loc[1]) document.documentElement.lang = decodeURIComponent(loc[1]);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${dmSans.variable} ${mono.variable} dark h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
