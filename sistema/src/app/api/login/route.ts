import { cookies } from "next/headers";
import { SESSION_COOKIE, createSession } from "@/lib/auth";
import { autenticar, listarUsuarios } from "@/lib/usuarios";

// GET diz se o hub ainda não tem usuários (a tela de login vira "criar administrador").
export async function GET() {
  return Response.json({ precisaSetup: (await listarUsuarios()).length === 0 });
}

// POST { email, senha } abre a sessão
export async function POST(request: Request) {
  const { email, senha } = (await request.json().catch(() => ({}))) as { email?: string; senha?: string };
  if (!email || !senha) return Response.json({ error: "informe e-mail e senha" }, { status: 400 });
  const usuario = await autenticar(email, senha);
  if (!usuario) return Response.json({ error: "e-mail ou senha incorretos" }, { status: 401 });
  (await cookies()).set(await createSession(usuario));
  return Response.json({ ok: true, trocarSenha: usuario.trocarSenha });
}

export async function DELETE() {
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
