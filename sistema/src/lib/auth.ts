import { cookies } from "next/headers";
import {
  getAppRuntimeConfig,
  isLoopbackHost,
  isValidIpv4,
  readRuntimeEnv,
} from "./config";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSessionJwt,
  verifySessionJwt,
  hasMinRole,
  type RoleType,
  type ImpersonationInfo,
} from "./jwt";
import { sessaoValida, type Usuario } from "./usuarios";

export { SESSION_COOKIE, hasMinRole, type RoleType, type ImpersonationInfo };

export type SessionCookieAttributes = {
  name: typeof SESSION_COOKIE;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
  expires?: Date;
};

/**
 * Resolve o atributo `Secure` do cookie de sessão (`hub_session`):
 * 1. Para HTTPS (`APP_BASE_URL` iniciando com `https://`), exige sempre `Secure = true`.
 * 2. Por padrão em produção (`NODE_ENV === "production"`), `Secure = true`.
 * 3. Exceção temporária explícita: enquanto o painel na VM operar em HTTP pelo IP
 *    (`APP_BASE_URL=http://172.212.145.134`) mantendo `NODE_ENV=production`, declarar
 *    `COOKIE_SECURE=0` permite `secure: false`. Em domínios não-IP em produção, `Secure` permanece exigido.
 */
export function resolveSessionCookieSecure(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const cfg = getAppRuntimeConfig(env);
  const rawCookieSecure = readRuntimeEnv("COOKIE_SECURE", env)?.toLowerCase();

  if (
    rawCookieSecure !== undefined &&
    rawCookieSecure !== "1" &&
    rawCookieSecure !== "0" &&
    rawCookieSecure !== "true" &&
    rawCookieSecure !== "false"
  ) {
    throw new Error(
      `Configuração inválida para COOKIE_SECURE="${rawCookieSecure}". Use "1", "0", "true" ou "false".`
    );
  }

  // Para HTTPS, exige sempre Secure
  if (cfg.appBaseUrl.startsWith("https://")) {
    return true;
  }

  const isHttpIpOrLoopback =
    cfg.appBaseUrl.startsWith("http://") &&
    (isValidIpv4(cfg.appPanelCleanHost) || isLoopbackHost(cfg.appPanelCleanHost));

  if (rawCookieSecure === "1" || rawCookieSecure === "true") {
    return true;
  }

  if (rawCookieSecure === "0" || rawCookieSecure === "false") {
    if (isHttpIpOrLoopback || env.NODE_ENV !== "production") {
      return false;
    }
    return true;
  }

  // Padrão seguro para produção quando COOKIE_SECURE não foi declarado
  return env.NODE_ENV === "production";
}

/**
 * Atributos padronizados para criação, renovação e remoção do cookie de sessão.
 * Nunca define `domain` (cookie host-only), evitando compartilhamento com domínios de clientes.
 */
export function getSessionCookieOptions(options?: {
  maxAge?: number;
  env?: NodeJS.ProcessEnv;
}): Omit<SessionCookieAttributes, "name" | "value"> {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: resolveSessionCookieSecure(options?.env),
    path: "/",
    maxAge: options?.maxAge ?? SESSION_MAX_AGE,
  };
}

/**
 * Gera o descritor de remoção do cookie de sessão (logout) com a exata mesma política do login.
 */
export function buildClearedSessionCookie(
  env: NodeJS.ProcessEnv = process.env
): SessionCookieAttributes {
  return {
    name: SESSION_COOKIE,
    value: "",
    ...getSessionCookieOptions({ maxAge: 0, env }),
    expires: new Date(0),
  };
}

/** Cookie de sessão de um usuário autenticado com contexto multi-tenant no JWT. */
export async function createSession(
  usuario: Pick<
    Usuario,
    "id" | "tenantId" | "role" | "isSuperAdmin" | "trocarSenha" | "preferredLocale" | "themePreference"
  > & {
    email?: string;
    fullName?: string;
    nome?: string;
    tenantName?: string;
  },
  impersonation?: ImpersonationInfo,
  env: NodeJS.ProcessEnv = process.env
): Promise<SessionCookieAttributes> {
  const token = await signSessionJwt({
    userId: usuario.id,
    email: usuario.email ?? "",
    fullName: usuario.fullName ?? usuario.nome ?? "",
    tenantId: usuario.tenantId,
    tenantName: usuario.tenantName ?? "",
    role: usuario.role,
    isSuperAdmin: usuario.isSuperAdmin,
    trocarSenha: usuario.trocarSenha,
    preferredLocale: usuario.preferredLocale || "pt-BR",
    themePreference: usuario.themePreference || "DARK",
    impersonation,
  });
  return {
    name: SESSION_COOKIE,
    value: token,
    ...getSessionCookieOptions({ maxAge: SESSION_MAX_AGE, env }),
  };
}

/** Usuário dono do token, se o token é válido, pertence ao tenant e segue ativo. */
export async function verifySession(token: string | undefined): Promise<Usuario | null> {
  if (!token) return null;
  const claims = await verifySessionJwt(token);
  if (!claims) return null;
  return sessaoValida(claims.userId, claims.iat, claims.tenantId, claims.impersonation);
}

/** Usuário da requisição atual (rotas e páginas do servidor). */
export async function usuarioAtual(): Promise<Usuario | null> {
  const cookieStore = await cookies();
  return verifySession(cookieStore.get(SESSION_COOKIE)?.value);
}

/** Exige sessão autenticada com papel mínimo no tenant atual. */
export async function exigirSessao(minRole: RoleType = "VIEWER"): Promise<Usuario | Response> {
  const u = await usuarioAtual();
  if (!u) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (!u.isSuperAdmin && !hasMinRole(u.role, minRole)) {
    return Response.json(
      { error: `Permissão insuficiente. Papel mínimo exigido: ${minRole}` },
      { status: 403 }
    );
  }
  return u;
}

/** Exige papel EDITOR, ADMIN ou OWNER (para criação/edição de recursos do tenant). */
export async function exigirEditor(): Promise<Usuario | Response> {
  return exigirSessao("EDITOR");
}

/** Para rotas de administração do tenant (OWNER ou ADMIN) ou Super Admin. */
export async function exigirAdmin(): Promise<Usuario | Response> {
  const u = await usuarioAtual();
  if (!u || (!u.isSuperAdmin && !hasMinRole(u.role, "ADMIN"))) {
    return Response.json({ error: "só administradores" }, { status: 403 });
  }
  return u;
}

/** Para rotas administrativas globais da plataforma Stage: exige isSuperAdmin === true. */
export async function exigirSuperAdmin(): Promise<Usuario | Response> {
  const u = await usuarioAtual();
  if (!u || !u.isSuperAdmin) {
    return Response.json({ error: "Acesso restrito ao Super Admin Stage" }, { status: 403 });
  }
  return u;
}
