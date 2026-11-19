import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "hub_session";
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const THEME_COOKIE = "NEXT_THEME";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

export type RoleType = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
export type ThemePrefType = "LIGHT" | "DARK" | "SYSTEM";

export type ImpersonationInfo = {
  adminId: string;
  adminEmail: string;
  adminName: string;
  tenantId: string;
  tenantName: string;
  startedAt: number;
};

export type JwtSessionClaims = {
  userId: string;
  email: string;
  fullName: string;
  tenantId: string;
  tenantName: string;
  role: RoleType;
  isSuperAdmin: boolean;
  trocarSenha: boolean;
  preferredLocale: string;
  themePreference: ThemePrefType;
  iat: number;
  impersonation?: ImpersonationInfo;
};

const ROLE_WEIGHT: Record<RoleType, number> = {
  VIEWER: 1,
  EDITOR: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function hasMinRole(userRole: RoleType, requiredRole: RoleType): boolean {
  return (ROLE_WEIGHT[userRole] ?? 0) >= (ROLE_WEIGHT[requiredRole] ?? 99);
}

function getJwtSecretBytes(): Uint8Array {
  const secret = process.env.JWT_SECRET || process.env.HUB_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET (ou HUB_SECRET) precisa ter 32+ caracteres em produção");
    }
    return new TextEncoder().encode("dev-only-stage-hub-jwt-secret-key-minimum-32-chars!!");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionJwt(
  claims: Omit<JwtSessionClaims, "iat" | "email" | "fullName" | "tenantName"> & {
    email?: string;
    fullName?: string;
    tenantName?: string;
  }
): Promise<string> {
  return new SignJWT({
    email: claims.email ?? "",
    name: claims.fullName ?? "",
    tid: claims.tenantId,
    tname: claims.tenantName ?? "",
    role: claims.role,
    sa: claims.isSuperAdmin,
    pwd: claims.trocarSenha,
    loc: claims.preferredLocale,
    thm: claims.themePreference,
    ...(claims.impersonation ? { imp: claims.impersonation } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getJwtSecretBytes());
}

export async function verifySessionJwt(token: string | undefined): Promise<JwtSessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecretBytes());
    if (typeof payload.sub !== "string" || typeof payload.iat !== "number") return null;
    const role = (typeof payload.role === "string" && payload.role in ROLE_WEIGHT
      ? payload.role
      : "EDITOR") as RoleType;
    return {
      userId: payload.sub,
      email: typeof payload.email === "string" ? payload.email : "",
      fullName: typeof payload.name === "string" ? payload.name : "",
      tenantId: typeof payload.tid === "string" ? payload.tid : "",
      tenantName: typeof payload.tname === "string" ? payload.tname : "",
      role,
      isSuperAdmin: payload.sa === true,
      trocarSenha: payload.pwd === true,
      preferredLocale: typeof payload.loc === "string" ? payload.loc : "pt-BR",
      themePreference:
        payload.thm === "LIGHT" || payload.thm === "DARK" || payload.thm === "SYSTEM"
          ? payload.thm
          : "DARK",
      iat: payload.iat,
      impersonation:
        payload.imp && typeof payload.imp === "object"
          ? (payload.imp as ImpersonationInfo)
          : undefined,
    };
  } catch {
    return null;
  }
}
