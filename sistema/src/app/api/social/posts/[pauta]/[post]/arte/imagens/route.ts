import fs from "node:fs/promises";
import path from "node:path";
import { caminhoPost, lerPost } from "@/lib/social";
import { listDir, resolveSafe } from "@/lib/workspace";

type Ctx = RouteContext<"/api/social/posts/[pauta]/[post]/arte/imagens">;

const EXT_IMAGEM = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);
const MAX_BYTES = 10 * 1024 * 1024;
const BIBLIOTECA = "marca/assets";

const ehImagem = (nome: string) => EXT_IMAGEM.has(nome.split(".").pop()?.toLowerCase() ?? "");

async function imagensEm(rel: string): Promise<string[]> {
  let entradas;
  try {
    entradas = await listDir(rel);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entradas) {
    if (e.type === "dir") out.push(...(await imagensEm(e.path)));
    else if (ehImagem(e.name)) out.push(e.path);
  }
  return out;
}

/** GET lista as imagens que o Editor de Arte pode usar: Biblioteca de assets + fotos enviadas para o Post. */
export async function GET(_req: Request, ctx: Ctx) {
  const { pauta, post } = await ctx.params;
  let rel: string;
  try {
    rel = caminhoPost(pauta, post);
  } catch {
    return Response.json({ error: "Post não encontrado" }, { status: 404 });
  }
  return Response.json({ biblioteca: await imagensEm(BIBLIOTECA), post: await imagensEm(`${rel}/arte/imagens`) });
}

/** POST (multipart, campo "arquivo") guarda uma foto em <post>/arte/imagens/ e devolve o caminho. */
export async function POST(request: Request, ctx: Ctx) {
  const { pauta, post } = await ctx.params;
  if (!(await lerPost(pauta, post))) return Response.json({ error: "Post não encontrado" }, { status: 404 });

  const arquivo = (await request.formData()).get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return Response.json({ error: "nenhum arquivo enviado" }, { status: 400 });
  if (!ehImagem(arquivo.name)) return Response.json({ error: `tipo não aceito: ${arquivo.name}` }, { status: 400 });
  if (arquivo.size > MAX_BYTES) return Response.json({ error: "imagem maior que 10 MB" }, { status: 400 });

  const ext = arquivo.name.split(".").pop()!.toLowerCase();
  const base = arquivo.name
    .slice(0, -(ext.length + 1))
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "imagem";

  const rel = `${caminhoPost(pauta, post)}/arte/imagens`;
  const dir = resolveSafe(rel);
  await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
  let nome = `${base}.${ext}`;
  for (let n = 2; await fs.access(/*turbopackIgnore: true*/ path.join(dir, nome)).then(() => true, () => false); n++) {
    nome = `${base}-${n}.${ext}`;
  }
  await fs.writeFile(/*turbopackIgnore: true*/ path.join(dir, nome), Buffer.from(await arquivo.arrayBuffer()));
  return Response.json({ path: `${rel}/${nome}` });
}
