import { exigirSessao } from "@/lib/auth";
import { listarPosts } from "@/lib/social";

// GET devolve o índice de Pautas e Posts do tenant autenticado para o Quadro e o Calendário
export async function GET() {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;
  try {
    return Response.json(await listarPosts(sessao.tenantId));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
