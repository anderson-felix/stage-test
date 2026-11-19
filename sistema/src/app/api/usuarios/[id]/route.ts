import { exigirAdmin } from "@/lib/auth";
import {
  alterarUsuario,
  papelToRole,
  publico,
  removerMembroDoTenant,
  senhaProvisoria,
  type MudancaUsuario,
} from "@/lib/usuarios";

/**
 * PATCH { nome?, papel?, role?, ativo?, redefinirSenha? } altera um membro do tenant atual (admin).
 * `redefinirSenha: true` gera uma senha provisória nova, devolvida uma única vez.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/usuarios/[id]">) {
  const admin = await exigirAdmin();
  if (admin instanceof Response) return admin;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const m: MudancaUsuario = {};
  if (typeof body.nome === "string") m.nome = body.nome;
  if (body.papel === "admin" || body.papel === "membro") m.papel = body.papel;
  if (typeof body.role === "string") m.role = papelToRole(body.role);
  if (typeof body.ativo === "boolean") m.ativo = body.ativo;
  const senha = body.redefinirSenha === true ? senhaProvisoria() : undefined;
  if (senha) Object.assign(m, { senha, trocarSenha: true });
  if (Object.keys(m).length === 0) return Response.json({ error: "nada para alterar" }, { status: 400 });
  if (
    id === admin.id &&
    (m.ativo === false ||
      m.papel === "membro" ||
      (m.role !== undefined && m.role !== "OWNER" && m.role !== "ADMIN"))
  ) {
    return Response.json({ error: "você não pode desativar nem rebaixar a si mesmo" }, { status: 400 });
  }

  try {
    const u = await alterarUsuario(id, m, admin.tenantId);
    return Response.json({ usuario: publico(u), ...(senha ? { senhaProvisoria: senha } : {}) });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

/**
 * DELETE remove o vínculo (TenantMember) do membro com o tenant atual.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/usuarios/[id]">) {
  const admin = await exigirAdmin();
  if (admin instanceof Response) return admin;
  const { id } = await ctx.params;

  if (id === admin.id) {
    return Response.json({ error: "você não pode remover seu próprio acesso" }, { status: 400 });
  }

  try {
    await removerMembroDoTenant(id, admin.tenantId);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
