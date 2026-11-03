import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createSession } from "@/lib/auth";
import { criarUsuario, listarUsuarios } from "@/lib/usuarios";

function mesmaChave(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * POST { chave, nome, email, senha } cria o primeiro administrador. Só funciona enquanto o hub
 * não tem nenhum usuário, e exige a HUB_PASSWORD do .env (quem instalou o servidor).
 */
export async function POST(request: Request) {
  if ((await listarUsuarios()).length > 0) return Response.json({ error: "o hub já tem usuários" }, { status: 409 });
  const esperado = process.env.HUB_PASSWORD;
  if (!esperado) return Response.json({ error: "HUB_PASSWORD não configurado no servidor" }, { status: 500 });

  const { chave, nome, email, senha } = (await request.json().catch(() => ({}))) as Record<string, string | undefined>;
  if (!chave || !mesmaChave(chave, esperado)) return Response.json({ error: "chave de instalação incorreta" }, { status: 401 });

  try {
    const admin = await criarUsuario({ nome: nome ?? "", email: email ?? "", senha: senha ?? "", papel: "admin", trocarSenha: false });
    (await cookies()).set(await createSession(admin));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
