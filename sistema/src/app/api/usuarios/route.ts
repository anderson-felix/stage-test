import { exigirAdmin } from "@/lib/auth";
import { criarUsuario, listarUsuarios, publico, senhaProvisoria, type Papel } from "@/lib/usuarios";

// GET lista os usuários (admin)
export async function GET() {
  const admin = await exigirAdmin();
  if (admin instanceof Response) return admin;
  return Response.json((await listarUsuarios()).map(publico));
}

// POST { nome, email, papel } cria um usuário com senha provisória, devolvida uma única vez (admin)
export async function POST(request: Request) {
  const admin = await exigirAdmin();
  if (admin instanceof Response) return admin;
  const { nome, email, papel } = (await request.json().catch(() => ({}))) as Record<string, string | undefined>;
  const senha = senhaProvisoria();
  try {
    const u = await criarUsuario({
      nome: nome ?? "",
      email: email ?? "",
      papel: (papel === "admin" ? "admin" : "membro") as Papel,
      senha,
      trocarSenha: true,
    });
    return Response.json({ usuario: publico(u), senhaProvisoria: senha });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
