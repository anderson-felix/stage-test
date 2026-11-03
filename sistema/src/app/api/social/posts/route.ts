import { listarPosts } from "@/lib/social";

// GET devolve o índice de Pautas e Posts (frontmatter) para o Quadro e o Calendário
export async function GET() {
  try {
    return Response.json(await listarPosts());
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
