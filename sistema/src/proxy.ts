import { NextResponse, type NextRequest } from "next/server";
import {
  buildAppPanelUrl,
  extractRequestHost,
  isAppPanelHost,
  isInternalCaddyRequestHost,
  sanitizeInternalRequestHeaders,
} from "@/lib/config";
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
export const CADDY_INTERNAL_ALLOW_PATH = "/api/internal/caddy/allow";
export const HEALTHCHECK_PATH = "/api/health";

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
  const sanitizedHeaders = sanitizeInternalRequestHeaders(request.headers);

  // Ignora arquivos internos, assets estáticos, APIs públicas de leads e mídia em qualquer host,
  // mas sempre repassa cabeçalhos higienizados (sem cabeçalhos internos forjados).
  if (
    pathname.startsWith("/_next/") ||
    pathname === "/_next" ||
    pathname === "/api/public" ||
    pathname.startsWith("/api/public/") ||
    pathname === "/api/media" ||
    pathname.startsWith("/api/media/") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo-stage.png"
  ) {
    sanitizedHeaders.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers: sanitizedHeaders } });
  }

  const { rawHost, cleanHost, isValid } = extractRequestHost(request);
  if (!isValid) {
    return new NextResponse("Host inválido", { status: 400 });
  }

  // Exceção EXATA para a chamada interna de autorização On-Demand TLS (`ask`) do Caddy:
  // - Permite exclusivamente `GET /api/internal/caddy/allow` quando originado em host interno/loopback/painel
  //   (`127.0.0.1`, `localhost`, `web` ou host do painel), negando domínios públicos de LPs.
  // - NÃO abre genericamente `/api/internal` ou subcaminhos, e NÃO confia em cabeçalhos arbitrários do cliente.
  // - Contrato de proteção de rede (Tarefa 08 antes do deploy): o Caddy deve bloquear `/api/internal/*`
  //   nas portas públicas 80/443 e a porta do backend (`3000`/`3100`) deve ser restrita a loopback/rede interna.
  if (pathname === CADDY_INTERNAL_ALLOW_PATH) {
    if (request.method !== "GET") {
      return NextResponse.json(
        { allowed: false, error: "Method Not Allowed" },
        { status: 405 }
      );
    }
    if (!isInternalCaddyRequestHost(rawHost, cleanHost)) {
      return NextResponse.json(
        { allowed: false, error: "Rota interna indisponível em domínio público de LP" },
        { status: 403 }
      );
    }
    sanitizedHeaders.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers: sanitizedHeaders } });
  }

  // Exceção EXATA para o endpoint mínimo de healthcheck (`/api/health`):
  // - Permite `GET` e `HEAD` sem cookie de sessão em hosts internos/loopback/painel (`127.0.0.1`, `localhost`, `web` ou host do painel).
  // - Nega em domínios públicos de LPs de clientes (403) e mantém `/api/status` e `/api/internal/*` protegidos.
  if (pathname === HEALTHCHECK_PATH) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
    }
    if (!isInternalCaddyRequestHost(rawHost, cleanHost)) {
      return NextResponse.json(
        { error: "Rota de healthcheck indisponível em domínio público de LP" },
        { status: 403 }
      );
    }
    sanitizedHeaders.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers: sanitizedHeaders } });
  }

  const isSaaSPanel = isAppPanelHost(rawHost, cleanHost);

  // CASO B — Host público de Landing Page (CustomDomain do cliente ou fallback quando habilitado)
  if (!isSaaSPanel) {
    sanitizedHeaders.set("x-pathname", pathname);

    if (pathname.startsWith("/lp-public/")) {
      return NextResponse.next({ request: { headers: sanitizedHeaders } });
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Rota de API privada indisponível em domínio público de LP" },
        { status: 403 }
      );
    }

    const rawSlug = pathname === "/" ? "" : pathname.replace(/^\/+|\/+$/g, "");
    const slug = rawSlug || "__root__";
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/lp-public/${encodeURIComponent(cleanHost)}/${encodeURIComponent(slug)}`;
    rewriteUrl.search = search;

    return NextResponse.rewrite(rewriteUrl, {
      request: { headers: sanitizedHeaders },
    });
  }

  // CASO A — Painel SaaS (IP da VM ex.: 172.212.145.134 / localhost:3100)
  sanitizedHeaders.set("x-pathname", pathname);

  if (ROTAS_PUBLICAS_PAINEL.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next({ request: { headers: sanitizedHeaders } });
  }

  const isApi = pathname.startsWith("/api/");
  const claims = await verifySessionJwt(request.cookies.get(SESSION_COOKIE)?.value);

  if (!claims || !claims.tenantId) {
    if (isApi) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
    return NextResponse.redirect(buildAppPanelUrl("/login", { requestHost: rawHost }));
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
    return NextResponse.redirect(
      buildAppPanelUrl("/conta?obrigatoria=1", { requestHost: rawHost })
    );
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
    return NextResponse.redirect(buildAppPanelUrl("/", { requestHost: rawHost }));
  }

  if (
    SO_TENANT_ADMIN.some((p) => pathname === p || pathname.startsWith(`${p}/`)) &&
    !claims.isSuperAdmin &&
    !hasMinRole(claims.role, "ADMIN")
  ) {
    if (isApi) {
      return NextResponse.json({ error: "só administradores" }, { status: 403 });
    }
    return NextResponse.redirect(buildAppPanelUrl("/", { requestHost: rawHost }));
  }

  const locale = resolvePreferredLocale(request, claims.preferredLocale);
  sanitizedHeaders.set("x-locale", locale);
  sanitizedHeaders.set("x-tenant-id", claims.tenantId);

  const response = NextResponse.next({
    request: {
      headers: sanitizedHeaders,
    },
  });
  response.headers.set("x-locale", locale);
  return response;
}

export default proxy;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo-stage.png).*)"],
};
