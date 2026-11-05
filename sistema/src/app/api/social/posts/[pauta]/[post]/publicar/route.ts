import { exigirEditor } from "@/lib/auth";
import { publishOrScheduleSocialPost, syncSocialPostMetrics } from "@/lib/social-oauth";
import { lerPost } from "@/lib/social";

type Params = { params: Promise<{ pauta: string; post: string }> };

export async function POST(request: Request, { params }: Params) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const { pauta: pautaSlug, post: postSlug } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    platform?: "instagram" | "linkedin";
    scheduledAt?: string | null;
    action?: "publish" | "sync_metrics";
  };

  try {
    const postAtual = await lerPost(pautaSlug, postSlug, sessao.tenantId);
    if (!postAtual) {
      return Response.json({ error: "Post não encontrado" }, { status: 404 });
    }

    if (body.action === "sync_metrics" && postAtual.id) {
      const updated = await syncSocialPostMetrics(sessao.tenantId, postAtual.id);
      return Response.json({ ok: true, post: updated });
    }

    const rawHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    const proto = request.headers.get("x-forwarded-proto") || (rawHost.startsWith("localhost") ? "http" : "https");
    const baseUrl = rawHost ? `${proto}://${rawHost}` : process.env.NEXT_PUBLIC_APP_URL;

    const platform = body.platform || postAtual.canal;
    const result = await publishOrScheduleSocialPost({
      tenantId: sessao.tenantId,
      pautaSlug,
      platform,
      scheduledAt: body.scheduledAt ?? null,
      baseUrl,
    });

    const postAtualizado = await lerPost(pautaSlug, postSlug, sessao.tenantId);
    return Response.json({
      ok: true,
      ...result,
      publishedPostId: result.externalPostId ?? result.post.externalPostId ?? null,
      post: postAtualizado,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

