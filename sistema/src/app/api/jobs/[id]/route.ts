import { exigirEditor, exigirSessao } from "@/lib/auth";
import { cancelAiJob, getAiJobStatus } from "@/lib/claude";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/jobs/[id] consulta status e resultado de um job assíncrono de IA do tenant
export async function GET(_request: Request, ctx: Ctx) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const { id } = await ctx.params;
  const job = getAiJobStatus(id, sessao.tenantId);
  if (!job) {
    return Response.json({ error: "Job não encontrado" }, { status: 404 });
  }
  return Response.json(job);
}

// DELETE /api/jobs/[id] cancela um job assíncrono em execução do tenant
export async function DELETE(_request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { id } = await ctx.params;
  const cancelled = cancelAiJob(id, sessao.tenantId);
  if (!cancelled) {
    return Response.json({ error: "Job não encontrado" }, { status: 404 });
  }
  return Response.json(cancelled);
}

