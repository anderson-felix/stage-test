import { exigirEditor, exigirSessao } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { atualizarPost, getPostMeta, lerPost } from "@/lib/social";
import { uploadTenantAsset } from "@/lib/storage";

type Ctx = RouteContext<"/api/social/posts/[pauta]/[post]/arte/imagens">;

const EXT_IMAGEM: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * GET lista as imagens que o Editor de Arte pode usar:
 * - `biblioteca`: ativos de imagem do tenant (`MediaAsset`)
 * - `post`: slides e fotos vinculadas a este `SocialPost` (`slidesBlobUrls` + `customImages`)
 * 100% livre de leitura de `cerebro/`.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const { pauta, post } = await ctx.params;
  const atual = await lerPost(pauta, post, sessao.tenantId);
  if (!atual || !atual.id) {
    return Response.json({ error: "Post não encontrado" }, { status: 404 });
  }

  const [postRow, assets] = await Promise.all([
    prisma.socialPost.findUnique({ where: { id: atual.id } }),
    prisma.mediaAsset.findMany({
      where: {
        tenantId: sessao.tenantId,
        mimeType: { startsWith: "image/" },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
  ]);

  const meta = postRow ? getPostMeta(postRow.arteHistoryJson) : {};
  const postImages = Array.from(
    new Set([...(meta.customImages ?? []), ...atual.arte.slides])
  );
  const biblioteca = assets.map((a) => `/api/media/${a.id}`);

  return Response.json({
    biblioteca,
    post: postImages,
  });
}

/**
 * POST (multipart, campo "arquivo") envia uma imagem para o Azure Blob Storage via `storage.ts`,
 * registra um `MediaAsset` no Prisma e vincula ao `SocialPost`.
 */
export async function POST(request: Request, ctx: Ctx) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { pauta, post } = await ctx.params;
  const atual = await lerPost(pauta, post, sessao.tenantId);
  if (!atual || !atual.id) {
    return Response.json({ error: "Post não encontrado" }, { status: 404 });
  }

  const form = await request.formData();
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return Response.json({ error: "nenhum arquivo enviado" }, { status: 400 });
  }

  const ext = arquivo.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = EXT_IMAGEM[ext];
  if (!mimeType) {
    return Response.json({ error: `tipo não aceito: ${arquivo.name}` }, { status: 400 });
  }
  if (arquivo.size > MAX_BYTES) {
    return Response.json({ error: "imagem maior que 10 MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const asset = await uploadTenantAsset({
    tenantId: sessao.tenantId,
    category: "social_slide",
    fileName: arquivo.name,
    mimeType,
    buffer,
  });

  const mediaUrl = `/api/media/${asset.id}`;

  const postRow = await prisma.socialPost.findUnique({ where: { id: atual.id } });
  const meta = postRow ? getPostMeta(postRow.arteHistoryJson) : {};
  const customImages = Array.from(new Set([mediaUrl, ...(meta.customImages ?? [])]));

  await atualizarPost(pauta, post, { customImages }, sessao.tenantId);

  return Response.json({ path: mediaUrl, assetId: asset.id });
}
