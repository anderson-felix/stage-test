import { atualizarFeedLinkedIn, lerFeedLinkedIn } from "@/lib/linkedin";

// GET devolve a última cópia da página real do LinkedIn (ou null)
export async function GET() {
  return Response.json(await lerFeedLinkedIn());
}

// POST lê a página pública agora e atualiza a cópia (alguns segundos)
export async function POST() {
  try {
    return Response.json(await atualizarFeedLinkedIn());
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
