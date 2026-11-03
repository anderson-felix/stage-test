import { exigirAdmin } from "@/lib/auth";
import { alterarUsuario, publico, senhaProvisoria, type MudancaUsuario } from "@/lib/usuarios";

/**
 * PATCH { nome?, papel?, ativo?, redefinirSenha? } altera um usuário (admin).
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
  if (typeof body.ativo === "boolean") m.ativo = body.ativo;
  const senha = body.redefinirSenha === true ? senhaProvisoria() : undefined;
  if (senha) Object.assign(m, { senha, trocarSenha: true });
  if (Object.keys(m).length === 0) return Response.json({ error: "nada para alterar" }, { status: 400 });
  if (id === admin.id && (m.ativo === false || m.papel === "membro")) {
    return Response.json({ error: "você não pode desativar nem rebaixar a si mesmo" }, { status: 400 });
  }

  try {
    const u = await alterarUsuario(id, m);
    return Response.json({ usuario: publico(u), ...(senha ? { senhaProvisoria: senha } : {}) });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
