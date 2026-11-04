import { cookies } from "next/headers";
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
  impersonation?: ImpersonationInfo
) {
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
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE === "1"
      : process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
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
