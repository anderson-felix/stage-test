import { exigirEditor } from "@/lib/auth";
import { extractDesignFromWebsite } from "@/lib/design-extractor";

export async function POST(request: Request) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { url } = (await request.json().catch(() => ({}))) as { url?: string };
  if (!url?.trim()) {
    return Response.json({ error: "Informe a URL do site para extração" }, { status: 400 });
  }

  try {
    const extracted = await extractDesignFromWebsite(sessao.tenantId, url.trim());
    return Response.json({ extracted });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

