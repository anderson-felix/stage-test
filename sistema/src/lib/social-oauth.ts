import crypto from "node:crypto";
import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

function getEncryptionKey(): Buffer {
  const raw =
    process.env.SOCIAL_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    process.env.HUB_SECRET ||
    "dev-only-stage-hub-social-token-encryption-key-32b";
  return crypto.createHash("sha256").update(raw).digest();
}

/**
 * Criptografa tokens OAuth (access_token / refresh_token) com AES-256-GCM antes de persistir no PostgreSQL.
 */
export function encryptSocialToken(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

/**
 * Descriptografa tokens OAuth armazenados em SocialAccount.
 */
export function decryptSocialToken(cipherText: string): string {
  const parts = cipherText.split(".");
  if (parts.length !== 3) {
    throw new Error("Formato de token criptografado inválido");
  }
  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64url");
  const authTag = Buffer.from(tagB64, "base64url");
  const encrypted = Buffer.from(dataB64, "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function signOAuthState(payload: { tenantId: string; platform: "instagram" | "linkedin" }): string {
  const data = JSON.stringify({ ...payload, ts: Date.now() });
  return encryptSocialToken(data);
}

export function verifyOAuthState(state: string): { tenantId: string; platform: "instagram" | "linkedin" } | null {
  try {
    const raw = decryptSocialToken(state);
    const parsed = JSON.parse(raw) as { tenantId?: string; platform?: string; ts?: number };
    if (!parsed.tenantId || (parsed.platform !== "instagram" && parsed.platform !== "linkedin")) {
      return null;
    }
    if (typeof parsed.ts === "number" && Date.now() - parsed.ts > 15 * 60 * 1000) {
      return null;
    }
    return { tenantId: parsed.tenantId, platform: parsed.platform };
  } catch {
    return null;
  }
}

export function getOAuthAuthorizationUrl(
  platform: "instagram" | "linkedin",
  tenantId: string,
  redirectOrigin: string
): string {
  const state = signOAuthState({ tenantId, platform });
  const redirectUri = `${redirectOrigin.replace(/\/+$/, "")}/api/social/oauth/${platform}/callback`;

  if (platform === "instagram") {
    const clientId = process.env.INSTAGRAM_CLIENT_ID;
    if (!clientId) {
      throw new Error(
        "INSTAGRAM_CLIENT_ID não configurado no servidor. Configure as credenciais do Meta App para conectar via OAuth."
      );
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list,pages_read_engagement",
      response_type: "code",
      state,
    });
    return `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "LINKEDIN_CLIENT_ID não configurado no servidor. Configure as credenciais do LinkedIn App para conectar via OAuth."
    );
  }
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile email w_member_social r_organization_social w_organization_social",
    state,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

export async function exchangeOAuthCode(
  platform: "instagram" | "linkedin",
  code: string,
  tenantId: string,
  redirectOrigin: string
) {
  const redirectUri = `${redirectOrigin.replace(/\/+$/, "")}/api/social/oauth/${platform}/callback`;

  if (platform === "instagram") {
    const clientId = process.env.INSTAGRAM_CLIENT_ID;
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("INSTAGRAM_CLIENT_ID e INSTAGRAM_CLIENT_SECRET são obrigatórios.");
    }

    const tokenUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", clientId);
    tokenUrl.searchParams.set("client_secret", clientSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenJson = (await tokenRes.json()) as { access_token?: string; expires_in?: number; error?: { message?: string } };
    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new Error(tokenJson.error?.message || "Falha ao trocar código OAuth do Instagram/Meta");
    }

    // Troca por long-lived token (60 dias)
    const llUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
    llUrl.searchParams.set("grant_type", "fb_exchange_token");
    llUrl.searchParams.set("client_id", clientId);
    llUrl.searchParams.set("client_secret", clientSecret);
    llUrl.searchParams.set("fb_exchange_token", tokenJson.access_token);

    const llRes = await fetch(llUrl.toString());
    const llJson = (await llRes.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    const finalAccessToken = llJson.access_token || tokenJson.access_token;
    const expiresInSec = llJson.expires_in || tokenJson.expires_in || 60 * 24 * 3600;

    // Descobre a conta Instagram Business vinculada às páginas do usuário
    const pagesRes = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,instagram_business_account{id,username,followers_count,media_count,profile_picture_url,biography}&access_token=${encodeURIComponent(finalAccessToken)}`
    );
    const pagesJson = (await pagesRes.json().catch(() => ({}))) as {
      data?: Array<{
        id: string;
        name: string;
        instagram_business_account?: {
          id: string;
          username?: string;
          followers_count?: number;
          media_count?: number;
          profile_picture_url?: string;
          biography?: string;
        };
      }>;
    };

    const igAccount = pagesJson.data?.find((p) => p.instagram_business_account)?.instagram_business_account;
    const handleOrPageId = igAccount?.id || pagesJson.data?.[0]?.id || "instagram_connected";

    return prisma.socialAccount.upsert({
      where: { tenantId_platform: { tenantId, platform: "instagram" } },
      create: {
        tenantId,
        platform: "instagram",
        handleOrPageId,
        accessTokenEnc: encryptSocialToken(finalAccessToken),
        tokenExpiresAt: new Date(Date.now() + expiresInSec * 1000),
        cachedProfileJson: (igAccount ?? {}) as Prisma.InputJsonValue,
        lastSyncedAt: new Date(),
      },
      update: {
        handleOrPageId,
        accessTokenEnc: encryptSocialToken(finalAccessToken),
        tokenExpiresAt: new Date(Date.now() + expiresInSec * 1000),
        cachedProfileJson: (igAccount ?? {}) as Prisma.InputJsonValue,
        lastSyncedAt: new Date(),
      },
    });
  }

  // LinkedIn OAuth 2.0
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("LINKEDIN_CLIENT_ID e LINKEDIN_CLIENT_SECRET são obrigatórios.");
  }

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(tokenJson.error_description || "Falha ao obter access_token do LinkedIn");
  }

  const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const profileJson = (await profileRes.json().catch(() => ({}))) as {
    sub?: string;
    name?: string;
    picture?: string;
  };
  const handleOrPageId = profileJson.sub ? `urn:li:person:${profileJson.sub}` : "linkedin_connected";
  const expiresInSec = tokenJson.expires_in || 60 * 24 * 3600;

  return prisma.socialAccount.upsert({
    where: { tenantId_platform: { tenantId, platform: "linkedin" } },
    create: {
      tenantId,
      platform: "linkedin",
      handleOrPageId,
      accessTokenEnc: encryptSocialToken(tokenJson.access_token),
      refreshTokenEnc: tokenJson.refresh_token ? encryptSocialToken(tokenJson.refresh_token) : null,
      tokenExpiresAt: new Date(Date.now() + expiresInSec * 1000),
      cachedProfileJson: profileJson as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    },
    update: {
      handleOrPageId,
      accessTokenEnc: encryptSocialToken(tokenJson.access_token),
      refreshTokenEnc: tokenJson.refresh_token ? encryptSocialToken(tokenJson.refresh_token) : null,
      tokenExpiresAt: new Date(Date.now() + expiresInSec * 1000),
      cachedProfileJson: profileJson as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    },
  });
}

/**
 * Garante um access_token válido para a conta social, renovando-o se estiver próximo do vencimento.
 */
export async function ensureValidSocialToken(accountId: string): Promise<{
  accessToken: string;
  handleOrPageId: string;
  platform: string;
}> {
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId } });
  if (!account || !account.accessTokenEnc) {
    throw new Error("Conta social não conectada via OAuth.");
  }

  let accessToken = decryptSocialToken(account.accessTokenEnc);
  const needsRefresh =
    account.tokenExpiresAt && account.tokenExpiresAt.getTime() - Date.now() < 24 * 60 * 60 * 1000;

  if (needsRefresh) {
    if (account.platform === "instagram" && process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET) {
      const refreshUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
      refreshUrl.searchParams.set("grant_type", "fb_exchange_token");
      refreshUrl.searchParams.set("client_id", process.env.INSTAGRAM_CLIENT_ID);
      refreshUrl.searchParams.set("client_secret", process.env.INSTAGRAM_CLIENT_SECRET);
      refreshUrl.searchParams.set("fb_exchange_token", accessToken);

      const res = await fetch(refreshUrl.toString());
      if (res.ok) {
        const json = (await res.json()) as { access_token?: string; expires_in?: number };
        if (json.access_token) {
          accessToken = json.access_token;
          await prisma.socialAccount.update({
            where: { id: account.id },
            data: {
              accessTokenEnc: encryptSocialToken(accessToken),
              tokenExpiresAt: new Date(Date.now() + (json.expires_in || 60 * 24 * 3600) * 1000),
            },
          });
        }
      }
    } else if (
      account.platform === "linkedin" &&
      account.refreshTokenEnc &&
      process.env.LINKEDIN_CLIENT_ID &&
      process.env.LINKEDIN_CLIENT_SECRET
    ) {
      const refreshToken = decryptSocialToken(account.refreshTokenEnc);
      const form = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      });
      const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      if (res.ok) {
        const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
        if (json.access_token) {
          accessToken = json.access_token;
          await prisma.socialAccount.update({
            where: { id: account.id },
            data: {
              accessTokenEnc: encryptSocialToken(accessToken),
              ...(json.refresh_token ? { refreshTokenEnc: encryptSocialToken(json.refresh_token) } : {}),
              tokenExpiresAt: new Date(Date.now() + (json.expires_in || 60 * 24 * 3600) * 1000),
            },
          });
        }
      }
    }
  }

  return {
    accessToken,
    handleOrPageId: account.handleOrPageId,
    platform: account.platform,
  };
}

/**
 * Publica ou agenda um SocialPost via API oficial (Meta Graph API / LinkedIn Posts API).
 */
export async function publishOrScheduleSocialPost(params: {
  tenantId: string;
  pautaSlug: string;
  platform: "instagram" | "linkedin";
  scheduledAt?: string | null;
  baseUrl?: string;
}) {
  const pauta = await prisma.socialPauta.findUnique({
    where: { tenantId_slug: { tenantId: params.tenantId, slug: params.pautaSlug } },
    include: { posts: true },
  });
  if (!pauta) {
    throw new Error("Pauta não encontrada para este tenant.");
  }

  const post = pauta.posts.find((p) => p.platform === params.platform) ?? pauta.posts[0];
  if (!post) {
    throw new Error("Post não encontrado nesta Pauta.");
  }

  if (params.scheduledAt) {
    const schedDate = new Date(params.scheduledAt);
    if (Number.isNaN(schedDate.getTime())) {
      throw new Error("Data de agendamento inválida.");
    }
    if (schedDate.getTime() > Date.now() + 60_000) {
      const updated = await prisma.socialPost.update({
        where: { id: post.id },
        data: {
          scheduledAt: schedDate,
          status: "SCHEDULED",
        },
      });
      await prisma.socialPauta.update({
        where: { id: pauta.id },
        data: { status: "SCHEDULED", scheduledDate: schedDate },
      });
      return { mode: "scheduled" as const, post: updated };
    }
  }

  const account = await prisma.socialAccount.findUnique({
    where: { tenantId_platform: { tenantId: params.tenantId, platform: params.platform } },
  });
  if (!account || !account.accessTokenEnc) {
    throw new Error(
      `Conta de ${params.platform === "instagram" ? "Instagram" : "LinkedIn"} ainda não conectada via OAuth. Conecte a conta para publicar diretamente pela API oficial.`
    );
  }

  const { accessToken, handleOrPageId } = await ensureValidSocialToken(account.id);
  const caption = (post.captionMarkdown || post.scriptMarkdown || pauta.title).trim();

  const appBaseUrl = (
    params.baseUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://stage.consulting"
  ).replace(/\/+$/, "");

  const toAbsoluteUrl = (u: string) => {
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;
    return `${appBaseUrl}${u.startsWith("/") ? "" : "/"}${u}`;
  };

  const rawSlides = Array.isArray(post.slidesBlobUrls) ? (post.slidesBlobUrls as string[]) : [];
  const slides = rawSlides.map(toAbsoluteUrl);

  let externalPostId = "";

  if (params.platform === "instagram") {
    if (slides.length === 0) {
      throw new Error("O post de Instagram precisa de pelo menos 1 slide/imagem renderizado para publicar.");
    }

    if (slides.length === 1) {
      const createRes = await fetch(`https://graph.facebook.com/v20.0/${handleOrPageId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: slides[0],
          caption,
          access_token: accessToken,
        }),
      });
      const createJson = (await createRes.json()) as { id?: string; error?: { message?: string } };
      if (!createRes.ok || !createJson.id) {
        throw new Error(createJson.error?.message || "Erro ao criar container de mídia no Instagram Graph API");
      }

      const pubRes = await fetch(`https://graph.facebook.com/v20.0/${handleOrPageId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: createJson.id,
          access_token: accessToken,
        }),
      });
      const pubJson = (await pubRes.json()) as { id?: string; error?: { message?: string } };
      if (!pubRes.ok || !pubJson.id) {
        throw new Error(pubJson.error?.message || "Erro ao publicar mídia no Instagram Graph API");
      }
      externalPostId = pubJson.id;
    } else {
      const childIds: string[] = [];
      for (const slideUrl of slides.slice(0, 10)) {
        const itemRes = await fetch(`https://graph.facebook.com/v20.0/${handleOrPageId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: slideUrl,
            is_carousel_item: true,
            access_token: accessToken,
          }),
        });
        const itemJson = (await itemRes.json()) as { id?: string; error?: { message?: string } };
        if (!itemRes.ok || !itemJson.id) {
          throw new Error(itemJson.error?.message || "Erro ao criar item do carrossel no Instagram Graph API");
        }
        childIds.push(itemJson.id);
      }

      const carouselRes = await fetch(`https://graph.facebook.com/v20.0/${handleOrPageId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "CAROUSEL",
          children: childIds,
          caption,
          access_token: accessToken,
        }),
      });
      const carouselJson = (await carouselRes.json()) as { id?: string; error?: { message?: string } };
      if (!carouselRes.ok || !carouselJson.id) {
        throw new Error(carouselJson.error?.message || "Erro ao criar container de carrossel no Instagram");
      }

      const pubRes = await fetch(`https://graph.facebook.com/v20.0/${handleOrPageId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: carouselJson.id,
          access_token: accessToken,
        }),
      });
      const pubJson = (await pubRes.json()) as { id?: string; error?: { message?: string } };
      if (!pubRes.ok || !pubJson.id) {
        throw new Error(pubJson.error?.message || "Erro ao publicar carrossel no Instagram");
      }
      externalPostId = pubJson.id;
    }
  } else {
    // LinkedIn Posts API
    const authorUrn = handleOrPageId.startsWith("urn:li:")
      ? handleOrPageId
      : `urn:li:organization:${handleOrPageId}`;

    const liRes = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202405",
      },
      body: JSON.stringify({
        author: authorUrn,
        commentary: caption,
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });

    if (!liRes.ok) {
      const errText = await liRes.text();
      throw new Error(`Erro ao publicar no LinkedIn (${liRes.status}): ${errText.slice(0, 240)}`);
    }
    externalPostId = liRes.headers.get("x-restli-id") || `li-${Date.now()}`;
  }

  const updated = await prisma.socialPost.update({
    where: { id: post.id },
    data: {
      externalPostId,
      publishedAt: new Date(),
      status: "PUBLISHED",
    },
  });

  await prisma.socialPauta.update({
    where: { id: pauta.id },
    data: { status: "PUBLISHED" },
  });

  return { mode: "published" as const, post: updated, externalPostId };
}

/**
 * Sincroniza métricas de engajamento (alcance, impressões, curtidas, comentários) via API oficial.
 */
export async function syncSocialPostMetrics(tenantId: string, postId: string) {
  const post = await prisma.socialPost.findFirst({
    where: { id: postId, tenantId },
  });
  if (!post || !post.externalPostId) {
    throw new Error("Post ainda não possui externalPostId publicado via API.");
  }

  const account = await prisma.socialAccount.findUnique({
    where: { tenantId_platform: { tenantId, platform: post.platform } },
  });
  if (!account || !account.accessTokenEnc) {
    throw new Error("Conta social não conectada via OAuth.");
  }

  const { accessToken } = await ensureValidSocialToken(account.id);
  let metrics: Record<string, unknown> = {};

  if (post.platform === "instagram") {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${encodeURIComponent(post.externalPostId)}?fields=like_count,comments_count,timestamp,permalink&access_token=${encodeURIComponent(accessToken)}`
    );
    if (res.ok) {
      metrics = (await res.json()) as Record<string, unknown>;
    }
  } else if (post.platform === "linkedin") {
    const res = await fetch(
      `https://api.linkedin.com/rest/socialMetadata/${encodeURIComponent(post.externalPostId)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
          "LinkedIn-Version": "202405",
        },
      }
    );
    if (res.ok) {
      metrics = (await res.json()) as Record<string, unknown>;
    }
  }

  metrics.syncedAt = new Date().toISOString();

  return prisma.socialPost.update({
    where: { id: post.id },
    data: {
      metricsJson: metrics as Prisma.InputJsonValue,
    },
  });
}

