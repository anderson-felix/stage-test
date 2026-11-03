import dns from "node:dns/promises";
import net from "node:net";
import * as cheerio from "cheerio";
import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { novaPagina } from "./render";

export type ExtractedDesignSystem = {
  sourceUrl: string;
  extractedAt: string;
  title: string;
  colors: {
    backgroundPrimary: string;
    backgroundSecondary: string;
    accentPrimary: string;
    accentHover: string;
    textPrimary: string;
    textSecondary: string;
    paletteSample: string[];
  };
  fonts: {
    display: string;
    sans: string;
    mono: string;
  };
  cssVariables: Record<string, string>;
  styleSummary: string;
};

/**
 * Verifica se um endereço IPv4 ou IPv6 pertence a faixas privadas, loopback,
 * link-local, carrier-grade NAT ou metadados de cloud (169.254.169.254).
 */
export function isPrivateOrInternalIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();

  if (normalized === "::1" || normalized === "::" || normalized === "0.0.0.0") {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:a.b.c.d)
  if (normalized.startsWith("::ffff:")) {
    const v4Part = normalized.slice(7);
    if (net.isIPv4(v4Part)) {
      return isPrivateOrInternalIp(v4Part);
    }
  }

  if (net.isIPv4(normalized)) {
    const parts = normalized.split(".").map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // Cloud metadata 169.254.169.254 / link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // Multicast / reserved
    return false;
  }

  if (net.isIPv6(normalized)) {
    if (
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Valida URL contra SSRF (Server-Side Request Forgery) resolvendo DNS
 * e bloqueando qualquer IP privado, loopback, link-local ou metadata.
 */
export async function validateSafeExternalUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("URL inválida. Use o formato https://suaempresa.com.br");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Protocolo não permitido. Use apenas http:// ou https://");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URLs com credenciais embutidas não são permitidas");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal"
  ) {
    throw new Error("Acesso a hosts internos ou locais bloqueado por política de segurança (SSRF)");
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrInternalIp(hostname)) {
      throw new Error("Endereço IP privado ou reservado bloqueado por segurança (SSRF)");
    }
    return parsed;
  }

  const records = await dns.lookup(hostname, { all: true }).catch(() => []);
  if (records.length === 0) {
    throw new Error(`Não foi possível resolver o DNS para ${hostname}`);
  }

  for (const rec of records) {
    if (isPrivateOrInternalIp(rec.address)) {
      throw new Error(
        `O domínio ${hostname} resolve para um endereço IP interno/privado bloqueado por segurança (SSRF)`
      );
    }
  }

  return parsed;
}

function parseStaticHtmlWithCheerio(html: string, urlStr: string): ExtractedDesignSystem {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || new URL(urlStr).hostname;

  const cssVariables: Record<string, string> = {};
  const hexColors = new Set<string>();
  const fontFamilies = new Set<string>();

  const styleContent = $("style")
    .map((_, el) => $(el).html() || "")
    .get()
    .join("\n");

  const varRegex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;}{]+);/g;
  let m: RegExpExecArray | null;
  while ((m = varRegex.exec(styleContent)) !== null) {
    const k = m[1].trim();
    const v = m[2].trim();
    if (Object.keys(cssVariables).length < 40) {
      cssVariables[k] = v;
    }
  }

  const hexRegex = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  while ((m = hexRegex.exec(styleContent + "\n" + html)) !== null) {
    hexColors.add(m[0].toUpperCase());
  }

  // Google Fonts links
  $('link[href*="fonts.googleapis.com"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const famMatches = href.matchAll(/family=([^&:]+)/g);
    for (const fm of famMatches) {
      const fName = decodeURIComponent(fm[1]).replace(/\+/g, " ").trim();
      if (fName) fontFamilies.add(fName);
    }
  });

  const palette = Array.from(hexColors).slice(0, 12);
  const fontsList = Array.from(fontFamilies);

  const bgPrimary =
    cssVariables["--bg"] ||
    cssVariables["--background"] ||
    palette.find((c) => /^#(0|1|F)/.test(c)) ||
    "#0A0A0A";
  const accentPrimary =
    cssVariables["--primary"] ||
    cssVariables["--brand"] ||
    cssVariables["--accent"] ||
    palette.find((c) => !/^#(000|FFF|111|EEE|F5F)/i.test(c)) ||
    "#C9A84C";

  return {
    sourceUrl: urlStr,
    extractedAt: new Date().toISOString(),
    title,
    colors: {
      backgroundPrimary: bgPrimary,
      backgroundSecondary: "#141414",
      accentPrimary,
      accentHover: accentPrimary,
      textPrimary: "#F5F5F0",
      textSecondary: "#A3A39E",
      paletteSample: palette,
    },
    fonts: {
      display: fontsList[0] || "Cormorant Garamond",
      sans: fontsList[1] || fontsList[0] || "Plus Jakarta Sans",
      mono: "JetBrains Mono",
    },
    cssVariables,
    styleSummary: `Extraído de ${urlStr} (${title}). Cores predominantes: ${
      palette.slice(0, 5).join(", ") || accentPrimary
    }. Tipografia: ${fontsList.join(", ") || "Padrão"}.`,
  };
}

/**
 * Inspeciona a URL do cliente com proteção SSRF usando Playwright + Cheerio
 * e salva o guia visual extraído em `BrandProfile.visualGuideJson`.
 */
export async function extractDesignFromWebsite(
  tenantId: string,
  rawUrl: string
): Promise<ExtractedDesignSystem> {
  const safeUrl = await validateSafeExternalUrl(rawUrl);
  let extracted: ExtractedDesignSystem | null = null;

  // Tenta inspeção com estilos computados reais via Playwright
  try {
    const page = await novaPagina({ viewport: { width: 1280, height: 800 } });
    try {
      await page.route("**/*", async (route) => {
        try {
          const reqUrl = route.request().url();
          if (reqUrl.startsWith("data:")) return route.continue();
          await validateSafeExternalUrl(reqUrl);
          return route.continue();
        } catch {
          return route.abort();
        }
      });

      await page.goto(safeUrl.href, { waitUntil: "domcontentloaded", timeout: 15000 });
      const html = await page.content();
      const base = parseStaticHtmlWithCheerio(html, safeUrl.href);

      const computed = await page.evaluate(() => {
        const bodyStyle = window.getComputedStyle(document.body);
        const h1 = document.querySelector("h1");
        const h1Style = h1 ? window.getComputedStyle(h1) : null;
        const btn = document.querySelector('a[class*="btn"], button, [role="button"]');
        const btnStyle = btn ? window.getComputedStyle(btn) : null;

        return {
          bodyBg: bodyStyle.backgroundColor,
          bodyColor: bodyStyle.color,
          bodyFont: bodyStyle.fontFamily.split(",")[0]?.replace(/["']/g, "").trim() || "",
          headingFont: h1Style
            ? h1Style.fontFamily.split(",")[0]?.replace(/["']/g, "").trim()
            : "",
          btnBg: btnStyle ? btnStyle.backgroundColor : "",
        };
      });

      extracted = {
        ...base,
        fonts: {
          display: computed.headingFont || base.fonts.display,
          sans: computed.bodyFont || base.fonts.sans,
          mono: base.fonts.mono,
        },
        colors: {
          ...base.colors,
          backgroundPrimary:
            computed.bodyBg && computed.bodyBg !== "rgba(0, 0, 0, 0)"
              ? computed.bodyBg
              : base.colors.backgroundPrimary,
          textPrimary: computed.bodyColor || base.colors.textPrimary,
          accentPrimary:
            computed.btnBg && computed.btnBg !== "rgba(0, 0, 0, 0)"
              ? computed.btnBg
              : base.colors.accentPrimary,
        },
      };
    } finally {
      await page.close();
    }
  } catch {
    // Fallback para fetch seguro + Cheerio caso Chromium não esteja disponível
    const res = await fetch(safeUrl.href, {
      redirect: "manual",
      headers: { "User-Agent": "StageHub-DesignExtractor/1.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (loc) {
        const redirectTarget = new URL(loc, safeUrl.href);
        await validateSafeExternalUrl(redirectTarget.href);
        const res2 = await fetch(redirectTarget.href, {
          redirect: "manual",
          signal: AbortSignal.timeout(12000),
        });
        const html2 = await res2.text();
        extracted = parseStaticHtmlWithCheerio(html2, redirectTarget.href);
      }
    }
    if (!extracted) {
      const html = await res.text();
      extracted = parseStaticHtmlWithCheerio(html, safeUrl.href);
    }
  }

  // Persiste em BrandProfile.visualGuideJson
  const currentBp = await prisma.brandProfile.findUnique({ where: { tenantId } });
  const prevGuide =
    currentBp?.visualGuideJson && typeof currentBp.visualGuideJson === "object"
      ? (currentBp.visualGuideJson as Record<string, unknown>)
      : {};

  await prisma.brandProfile.upsert({
    where: { tenantId },
    update: {
      websiteUrl: safeUrl.href,
      visualGuideJson: {
        ...prevGuide,
        ...extracted,
      } as unknown as Prisma.InputJsonValue,
    },
    create: {
      tenantId,
      websiteUrl: safeUrl.href,
      visualGuideJson: extracted as unknown as Prisma.InputJsonValue,
      onboardingCompleted: false,
    },
  });

  return extracted;
}

