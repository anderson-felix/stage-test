import { NextResponse } from "next/server";
import { exigirSessao } from "@/lib/auth";
import { exchangeOAuthCode, verifyOAuthState } from "@/lib/social-oauth";

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

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/social/${platform}?oauth_error=${encodeURIComponent(error)}`, url.origin));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL(`/social/${platform}?oauth_error=missing_code`, url.origin));
  }

  const verified = verifyOAuthState(state);
  if (!verified || verified.tenantId !== sessao.tenantId || verified.platform !== platform) {
    return NextResponse.redirect(new URL(`/social/${platform}?oauth_error=invalid_state`, url.origin));
  }

  try {
    await exchangeOAuthCode(platform, code, sessao.tenantId, url.origin);
    return NextResponse.redirect(new URL(`/social/${platform}?oauth_success=1`, url.origin));
  } catch (err) {
    return NextResponse.redirect(
      new URL(`/social/${platform}?oauth_error=${encodeURIComponent((err as Error).message)}`, url.origin)
    );
  }
}

