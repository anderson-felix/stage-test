import { atualizarFeedInstagram, lerFeedInstagram } from "@/lib/instagram";

// GET devolve a última cópia do feed real do Instagram (ou null)
export async function GET() {
  return Response.json(await lerFeedInstagram());
}

// POST lê o perfil público agora e atualiza a cópia (leva de 10 a 30 s)
export async function POST() {
  try {
    return Response.json(await atualizarFeedInstagram());
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
