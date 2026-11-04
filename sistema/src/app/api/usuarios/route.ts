import { exigirAdmin } from "@/lib/auth";
import {
  criarUsuario,
  listarUsuarios,
  papelToRole,
  publico,
  roleToPapel,
  senhaProvisoria,
  type Role,
} from "@/lib/usuarios";

// GET lista os membros (TenantMember) do tenant autenticado
export async function GET() {
  const admin = await exigirAdmin();
  if (admin instanceof Response) return admin;
  const lista = await listarUsuarios(admin.tenantId);
  return Response.json(lista.map(publico));
}

// POST { nome, email, role?, papel? } adiciona/convida membro ao tenant atual com senha provisória
export async function POST(request: Request) {
  const admin = await exigirAdmin();
  if (admin instanceof Response) return admin;
  const { nome, email, papel, role } = (await request.json().catch(() => ({}))) as Record<
    string,
    string | undefined
  >;
  const senha = senhaProvisoria();
  const resolvedRole: Role = role ? papelToRole(role) : papelToRole(papel ?? "EDITOR");

  try {
    const u = await criarUsuario({
      nome: nome ?? "",
      email: email ?? "",
      role: resolvedRole,
      papel: roleToPapel(resolvedRole),
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
