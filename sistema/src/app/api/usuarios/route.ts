import { exigirAdmin } from "@/lib/auth";
import {
  criarUsuario,
  listarUsuarios,
  papelToRole,
  publico,
  senhaProvisoria,
  type Papel,
  type Role,
} from "@/lib/usuarios";

// GET lista os usuários do tenant autenticado (admin)
export async function GET() {
  const admin = await exigirAdmin();
  if (admin instanceof Response) return admin;
  const lista = await listarUsuarios(admin.tenantId);
  return Response.json(lista.map(publico));
}

// POST { nome, email, papel?, role? } cria um usuário no tenant atual com senha provisória (admin)
export async function POST(request: Request) {
  const admin = await exigirAdmin();
  if (admin instanceof Response) return admin;
  const { nome, email, papel, role } = (await request.json().catch(() => ({}))) as Record<
    string,
    string | undefined
  >;
  const senha = senhaProvisoria();
  const resolvedRole: Role = role ? papelToRole(role) : papelToRole((papel as Papel) ?? "membro");

  try {
    const u = await criarUsuario({
      nome: nome ?? "",
      email: email ?? "",
      role: resolvedRole,
      papel: (papel === "admin" ? "admin" : "membro") as Papel,
      senha,
      trocarSenha: true,
      tenantId: admin.tenantId,
      isSuperAdmin: false,
    });
    return Response.json({ usuario: publico(u), senhaProvisoria: senha });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
