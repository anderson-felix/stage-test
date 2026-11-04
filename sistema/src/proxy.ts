import { NextResponse, type NextRequest } from "next/server";
import {
  LOCALE_COOKIE,
  SESSION_COOKIE,
  hasMinRole,
  verifySessionJwt,
} from "@/lib/jwt";

const SUPPORTED_LOCALES = ["pt-BR", "en-US", "es-ES"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// Com senha provisória, só dá para chegar na troca de senha (e sair).
const LIBERADO_COM_SENHA_PROVISORIA = ["/conta", "/api/conta", "/api/login", "/login"];
const SO_TENANT_ADMIN = ["/usuarios", "/api/usuarios"];
const SO_SUPER_ADMIN = ["/admin", "/api/admin"];
const ROTAS_PUBLICAS_PAINEL = ["/login", "/api/login", "/api/public", "/api/media", "/lp-public"];

function extractAndNormalizeHost(request: NextRequest): {
  rawHost: string;
  cleanHost: string;
  isValid: boolean;
} {
  const isTrustedProxy =
    process.env.TRUSTED_PROXY === "1" || Boolean(request.headers.get("x-azure-fdid"));
  const forwardedHost = isTrustedProxy
    ? request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    : undefined;
  const headerHost = forwardedHost || request.headers.get("host") || request.nextUrl.host || "";

  const lower = headerHost.trim().toLowerCase();
  const withoutPort = lower.replace(/:\d+$/, "");

  const isValid =
    withoutPort.length > 0 &&
    withoutPort.length <= 253 &&
    /^[a-z0-9.-]+$/.test(withoutPort) &&
    !withoutPort.startsWith(".") &&
    !withoutPort.endsWith(".") &&
    !withoutPort.includes("..");

  return { rawHost: lower, cleanHost: withoutPort, isValid };
}

function isAppPanelHost(rawHost: string, cleanHost: string): boolean {
  const configuredAppDomain = (process.env.NEXT_PUBLIC_APP_DOMAIN || "localhost:3100")
    .trim()
    .toLowerCase();
  const configuredClean = configuredAppDomain.replace(/:\d+$/, "");

  if (rawHost === configuredAppDomain || cleanHost === configuredClean) {
    return true;
  }
  if (cleanHost === "localhost" || cleanHost === "127.0.0.1") {
    return true;
  }
  return false;
}

function resolvePreferredLocale(
  request: NextRequest,
  jwtLocale?: string
): SupportedLocale {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale as SupportedLocale)) {
    return cookieLocale as SupportedLocale;
  }
  if (jwtLocale && SUPPORTED_LOCALES.includes(jwtLocale as SupportedLocale)) {
    return jwtLocale as SupportedLocale;
  }
  const acceptLang = request.headers.get("accept-language") || "";
  for (const part of acceptLang.split(",")) {
    const code = part.split(";")[0]?.trim().toLowerCase() || "";
    if (code.startsWith("en")) return "en-US";
    if (code.startsWith("es")) return "es-ES";
    if (code.startsWith("pt")) return "pt-BR";
  }
  return "pt-BR";
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Ignora arquivos internos, assets estáticos, APIs públicas de leads e mídia em qualquer host
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/public/") ||
    pathname.startsWith("/api/media/") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo-stage.png"
  ) {
    return NextResponse.next();
  }

  const { rawHost, cleanHost, isValid } = extractAndNormalizeHost(request);
  if (!isValid) {
    return new NextResponse("Host inválido", { status: 400 });
  }

  const isSaaSPanel = isAppPanelHost(rawHost, cleanHost);

  // CASO B — Host público de Landing Page (CustomDomain do cliente ou {tenant-slug}.lp.stage.consult)
  if (!isSaaSPanel) {
    if (
      pathname.startsWith("/api/public/") ||
      pathname.startsWith("/api/media/") ||
      pathname.startsWith("/_next/") ||
      pathname === "/favicon.ico"
    ) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/lp-public/")) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Rota de API privada indisponível em domínio público de LP" },
        { status: 403 }
      );
    }

    if (pathname === "/") {
      const rootRewrite = new URL(
        `/lp-public/${encodeURIComponent(cleanHost)}/__root__${search}`,
        request.url
      );
      return NextResponse.rewrite(rootRewrite);
    }

    const rawSlug = pathname.replace(/^\/+|\/+$/g, "");
    const slug = rawSlug || "__root__";
    const rewriteUrl = new URL(
      `/lp-public/${encodeURIComponent(cleanHost)}/${encodeURIComponent(slug)}${search}`,
      request.url
    );
    return NextResponse.rewrite(rewriteUrl);
  }

  // CASO A — Painel SaaS (app.stage.consult / localhost:3100)
  if (ROTAS_PUBLICAS_PAINEL.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");
  const claims = await verifySessionJwt(request.cookies.get(SESSION_COOKIE)?.value);

  if (!claims || !claims.tenantId) {
    if (isApi) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (
    claims.trocarSenha &&
    !LIBERADO_COM_SENHA_PROVISORIA.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    if (isApi) {
      return NextResponse.json(
        { error: "troque a senha provisória antes de continuar" },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/conta?obrigatoria=1", request.url));
  }

  if (
    SO_SUPER_ADMIN.some((p) => pathname === p || pathname.startsWith(`${p}/`)) &&
    !claims.isSuperAdmin
  ) {
    if (isApi) {
      return NextResponse.json(
        { error: "Acesso restrito ao Super Admin Stage" },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (
    SO_TENANT_ADMIN.some((p) => pathname === p || pathname.startsWith(`${p}/`)) &&
    !claims.isSuperAdmin &&
    !hasMinRole(claims.role, "ADMIN")
  ) {
    if (isApi) {
      return NextResponse.json({ error: "só administradores" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  const locale = resolvePreferredLocale(request, claims.preferredLocale);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-locale", locale);
  requestHeaders.set("x-tenant-id", claims.tenantId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("x-locale", locale);
  return response;
}

export default proxy;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo-stage.png).*)"],
};
