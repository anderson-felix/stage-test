import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/auth";
import { getOAuthAuthorizationUrl } from "@/lib/social-oauth";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  context: { params: Promise<{ platform: string }> }
) {
  const sessao = await exigirSessao("ADMIN");
  if (sessao instanceof Response) return sessao;

  const { platform } = await context.params;
  if (platform !== "instagram" && platform !== "linkedin") {
    return Response.json({ error: "Plataforma inválida" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  try {
    const authUrl = getOAuthAuthorizationUrl(platform, sessao.tenantId, origin);
    return NextResponse.redirect(authUrl);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ platform: string }> }
) {
  const sessao = await exigirSessao("ADMIN");
  if (sessao instanceof Response) return sessao;

  const { platform } = await context.params;
  if (platform !== "instagram" && platform !== "linkedin") {
    return Response.json({ error: "Plataforma inválida" }, { status: 400 });
  }

  await prisma.socialAccount.updateMany({
    where: { tenantId: sessao.tenantId, platform },
    data: {
      accessTokenEnc: null,
      refreshTokenEnc: null,
      tokenExpiresAt: null,
    },
  });

  return Response.json({ ok: true });
}

