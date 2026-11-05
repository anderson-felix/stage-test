import { exigirEditor } from "@/lib/auth";
import { publishOrScheduleSocialPost, syncSocialPostMetrics } from "@/lib/social-oauth";

export async function POST(request: Request) {
  const sessao = await exigirEditor();
  if (sessao instanceof Response) return sessao;

  const body = (await request.json().catch(() => ({}))) as {
    pautaSlug?: string;
    platform?: "instagram" | "linkedin";
    scheduledAt?: string | null;
    action?: "publish" | "sync_metrics";
    postId?: string;
  };

  try {
    if (body.action === "sync_metrics" && body.postId) {
      const updated = await syncSocialPostMetrics(sessao.tenantId, body.postId);
      return Response.json({ ok: true, post: updated });
    }

    if (!body.pautaSlug || (body.platform !== "instagram" && body.platform !== "linkedin")) {
      return Response.json({ error: "pautaSlug e platform ('instagram' | 'linkedin') são obrigatórios" }, { status: 400 });
    }

    const rawHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    const proto = request.headers.get("x-forwarded-proto") || (rawHost.startsWith("localhost") ? "http" : "https");
    const baseUrl = rawHost ? `${proto}://${rawHost}` : process.env.NEXT_PUBLIC_APP_URL;

    const result = await publishOrScheduleSocialPost({
      tenantId: sessao.tenantId,
      pautaSlug: body.pautaSlug,
      platform: body.platform,
      scheduledAt: body.scheduledAt ?? null,
      baseUrl,
    });

    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

