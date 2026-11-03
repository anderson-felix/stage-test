import { exigirEditor, exigirSessao } from "@/lib/auth";
import { listTenantAssets, uploadTenantAsset } from "@/lib/storage";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
]);

export async function GET(request: Request) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const category = new URL(request.url).searchParams.get("category") || undefined;
  const assets = await listTenantAssets(sessao.tenantId, category);
  return Response.json({ assets });
}

export async function POST(request: Request) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const form = await request.formData();
  const file = form.get("arquivo") ?? form.get("file");
  const category = (form.get("category") as string) || "upload";

  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Envie um arquivo válido" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Arquivo maior que 15 MB" }, { status: 400 });
  }
  const mimeType = file.type || "image/png";
  if (!ALLOWED_MIME.has(mimeType)) {
    return Response.json(
      { error: `Formato não suportado (${mimeType}). Use PNG, JPG, WEBP, SVG ou PDF.` },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await uploadTenantAsset({
      tenantId: sessao.tenantId,
      category,
      fileName: file.name,
      mimeType,
      buffer,
    });
    return Response.json({ asset });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

