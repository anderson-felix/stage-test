import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sessionSecret } from "./config";
import { sessaoValida, type Usuario } from "./usuarios";

export const SESSION_COOKIE = "hub_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

/** Cookie de sessão de um usuário (o JWT leva só o id; papel e status são lidos do cadastro). */
export async function createSession(usuario: Pick<Usuario, "id">) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(usuario.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(sessionSecret());
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "1" : process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  };
}

/** Usuário dono do token, se o token é válido e o usuário segue ativo (sem senha trocada depois). */
export async function verifySession(token: string | undefined): Promise<Usuario | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    if (typeof payload.sub !== "string" || typeof payload.iat !== "number") return null;
    return await sessaoValida(payload.sub, payload.iat);
  } catch {
    return null;
  }
}

/** Usuário da requisição atual (rotas e páginas do servidor). */
export async function usuarioAtual(): Promise<Usuario | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Para rotas só de admin: devolve o admin ou uma Response 403 pronta. */
export async function exigirAdmin(): Promise<Usuario | Response> {
  const u = await usuarioAtual();
  if (!u || u.papel !== "admin") return Response.json({ error: "só administradores" }, { status: 403 });
  return u;
}
