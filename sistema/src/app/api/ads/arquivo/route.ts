import fs from "node:fs/promises";
import { CAMPANHAS_DIR } from "@/lib/ads";
import { resolveSafe } from "@/lib/workspace";

// GET ?path=marketing/ads/campanhas/<slug>/ads-editor/<arquivo>.csv baixa um arquivo da Campanha
export async function GET(request: Request) {
  const rel = new URL(request.url).searchParams.get("path") ?? "";
  const segmentos = rel.split(/[\\/]/);
  const ok =
    rel.startsWith(`${CAMPANHAS_DIR}/`) &&
    !segmentos.includes("..") &&
    (segmentos.includes("ads-editor") || segmentos.includes("pesquisa")) &&
    /\.(csv|md)$/i.test(rel);
  if (!ok) return Response.json({ error: "arquivo não permitido" }, { status: 400 });
  try {
    const buf = await fs.readFile(/*turbopackIgnore: true*/ resolveSafe(rel));
    const nome = `${segmentos[3]}-${segmentos[segmentos.length - 1]}`;
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": rel.endsWith(".md") ? "text/markdown; charset=utf-8" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nome}"`,
      },
    });
  } catch {
    return Response.json({ error: "arquivo não encontrado" }, { status: 404 });
  }
}
