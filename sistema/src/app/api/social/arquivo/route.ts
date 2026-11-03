import fs from "node:fs/promises";
import { SOCIAL_DIR } from "@/lib/social";
import { resolveSafe } from "@/lib/workspace";

const TIPOS: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
};

// GET ?path=marketing/social/.../arte/slide-01.png[&download=1] serve um arquivo de Arte
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rel = params.get("path") ?? "";
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  const segmentos = rel.split(/[\\/]/);
  if (!rel.startsWith(`${SOCIAL_DIR}/`) || !segmentos.includes("arte") || segmentos.includes("..") || !TIPOS[ext]) {
    return Response.json({ error: "arquivo não permitido" }, { status: 400 });
  }
  try {
    const buf = await fs.readFile(/*turbopackIgnore: true*/ resolveSafe(rel));
    const nome = rel.split("/").slice(-4).join("_").replace("_arte_", "_");
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": TIPOS[ext],
        "Cache-Control": "private, max-age=31536000, immutable",
        ...(params.get("download") ? { "Content-Disposition": `attachment; filename="${nome}"` } : {}),
      },
    });
  } catch {
    return Response.json({ error: "arquivo não encontrado" }, { status: 404 });
  }
}
