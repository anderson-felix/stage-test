import { exigirSuperAdmin } from "@/lib/auth";
import { listDir, readText, writeText } from "@/lib/workspace";

// GET ?dir=<rel> lista uma pasta · GET ?file=<rel> lê um arquivo de texto (restrito ao Super Admin)
export async function GET(request: Request) {
  const admin = await exigirSuperAdmin();
  if (admin instanceof Response) return admin;

  const params = new URL(request.url).searchParams;
  try {
    const file = params.get("file");
    if (file !== null) return Response.json({ path: file, content: await readText(file) });
    return Response.json({ entries: await listDir(params.get("dir") ?? "") });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

// PUT { path, content } salva um arquivo de texto (restrito ao Super Admin)
export async function PUT(request: Request) {
  const admin = await exigirSuperAdmin();
  if (admin instanceof Response) return admin;

  const { path, content } = (await request.json()) as { path?: string; content?: string };
  if (!path || typeof content !== "string") {
    return Response.json({ error: "path e content são obrigatórios" }, { status: 400 });
  }
  try {
    await writeText(path, content);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
