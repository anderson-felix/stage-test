import { cookies } from "next/headers";
import { createSession, usuarioAtual } from "@/lib/auth";
import { alterarUsuario, autenticar, publico } from "@/lib/usuarios";

// GET devolve o usuário logado
export async function GET() {
  const u = await usuarioAtual();
  if (!u) return Response.json({ error: "não autenticado" }, { status: 401 });
  return Response.json(publico(u));
}

// PATCH { senhaAtual, novaSenha } troca a própria senha (e derruba as outras sessões)
export async function PATCH(request: Request) {
  const u = await usuarioAtual();
  if (!u) return Response.json({ error: "não autenticado" }, { status: 401 });
  const { senhaAtual, novaSenha } = (await request.json().catch(() => ({}))) as Record<string, string | undefined>;
  if (!senhaAtual || !(await autenticar(u.email, senhaAtual))) {
    return Response.json({ error: "senha atual incorreta" }, { status: 400 });
  }
  if (!novaSenha || novaSenha === senhaAtual) return Response.json({ error: "escolha uma senha diferente da atual" }, { status: 400 });
  try {
    const novo = await alterarUsuario(u.id, { senha: novaSenha, trocarSenha: false });
    (await cookies()).set(await createSession(novo));
    return Response.json(publico(novo));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
