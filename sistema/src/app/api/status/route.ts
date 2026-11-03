import { exigirSessao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function checkSiteOnline(url: string) {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    return {
      url,
      online: res.ok,
      status: res.status,
      ms: Date.now() - start,
      https: url.startsWith("https://"),
    };
  } catch {
    return {
      url,
      online: false,
      status: 0,
      ms: Date.now() - start,
      https: url.startsWith("https://"),
    };
  }
}

export async function GET() {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const tenantId = sessao.tenantId;

  const [
    tenant,
    brandProfile,
    customDomain,
    emailConfig,
    lps,
    leadsCount,
    recentLeads,
    campaigns,
    socialAccounts,
    pautasCount,
    postsCount,
    mediaCount,
  ] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        planTier: true,
        tokenCreditBalance: true,
        defaultLocale: true,
      },
    }),
    prisma.brandProfile.findUnique({ where: { tenantId } }),
    prisma.customDomain.findFirst({
      where: { tenantId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
    prisma.tenantEmailConfig.findUnique({ where: { tenantId } }),
    prisma.landingPage.findMany({
      where: { tenantId },
      select: { id: true, slug: true, title: true, status: true, viewsCount: true, updatedAt: true },
    }),
    prisma.lpLead.count({ where: { tenantId } }),
    prisma.lpLead.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { landingPage: { select: { slug: true, title: true } } },
    }),
    prisma.adCampaign.findMany({
      where: { tenantId },
      select: { id: true, slug: true, name: true, status: true },
    }),
    prisma.socialAccount.findMany({
      where: { tenantId },
      select: { platform: true, handleOrPageId: true, accessTokenEnc: true, tokenExpiresAt: true },
    }),
    prisma.socialPauta.count({ where: { tenantId } }),
    prisma.socialPost.count({ where: { tenantId } }),
    prisma.mediaAsset.count({ where: { tenantId } }),
  ]);

  const siteUrl = brandProfile?.websiteUrl || process.env.SITE_URL || "https://stage.consulting";
  const site = await checkSiteOnline(siteUrl);

  const memory = [
    { file: "contexto/negocio.md", filled: Boolean(brandProfile?.businessContext && brandProfile.businessContext.trim().length > 20) },
    { file: "contexto/voz.md", filled: Boolean((brandProfile?.toneOfVoice && brandProfile.toneOfVoice.trim().length > 20) || (brandProfile?.brandRules && brandProfile.brandRules.trim().length > 20)) },
    { file: "contexto/foco.md", filled: Boolean(brandProfile?.currentFocus && brandProfile.currentFocus.trim().length > 20) },
    { file: "marca/guia-visual.md", filled: Boolean(brandProfile?.visualGuideJson) },
  ];

  const totalViews = lps.reduce((acc, lp) => acc + (lp.viewsCount ?? 0), 0);
  const publishedLps = lps.filter((lp) => lp.status === "PUBLISHED").length;
  const conversionRate = totalViews > 0 ? Number(((leadsCount / totalViews) * 100).toFixed(2)) : 0;
  const connectedSocial = socialAccounts.filter((s) => Boolean(s.accessTokenEnc));

  return Response.json({
    site,
    workspace: {
      files: mediaCount,
      memory,
      lastChange: lps[0]
        ? { when: lps[0].updatedAt.toISOString(), subject: `LP: ${lps[0].title}` }
        : null,
    },
    social: {
      connected: connectedSocial.length > 0,
      accounts: socialAccounts.map((s) => ({
        platform: s.platform,
        handle: s.handleOrPageId,
        oauthConnected: Boolean(s.accessTokenEnc),
      })),
      pautasCount,
      postsCount,
    },
    ads: {
      connected: campaigns.length > 0,
      campaignsCount: campaigns.length,
    },
    tenant: {
      id: tenant?.id ?? tenantId,
      name: tenant?.name ?? "Workspace",
      slug: tenant?.slug ?? "workspace",
      planTier: tenant?.planTier ?? "starter",
      tokenCreditBalance: tenant?.tokenCreditBalance ?? 0,
      onboardingCompleted: brandProfile?.onboardingCompleted ?? false,
    },
    metrics: {
      totalLps: lps.length,
      publishedLps,
      totalViews,
      totalLeads: leadsCount,
      conversionRate,
      totalCampaigns: campaigns.length,
      totalPautas: pautasCount,
      totalPosts: postsCount,
      totalMediaAssets: mediaCount,
      recentLeads: recentLeads.map((l) => {
        const p = (l.payload && typeof l.payload === "object" ? l.payload : {}) as Record<string, unknown>;
        const u = (l.utmData && typeof l.utmData === "object" ? l.utmData : {}) as Record<string, unknown>;
        return {
          id: l.id,
          name: String(p.nome ?? p.name ?? "Lead"),
          email: String(p.email ?? ""),
          phone: p.telefone || p.phone ? String(p.telefone ?? p.phone) : null,
          company: p.empresa || p.company ? String(p.empresa ?? p.company) : null,
          lpSlug: l.landingPage.slug,
          lpTitle: l.landingPage.title,
          utmSource: u.utm_source ? String(u.utm_source) : null,
          utmMedium: u.utm_medium ? String(u.utm_medium) : null,
          utmCampaign: u.utm_campaign ? String(u.utm_campaign) : null,
          emailDeliveryStatus: l.emailDeliveryStatus,
          createdAt: l.createdAt.toISOString(),
        };
      }),
    },
    domain: customDomain
      ? {
          id: customDomain.id,
          domain: customDomain.domain,
          dnsStatus: customDomain.dnsStatus,
          sslStatus: customDomain.sslStatus,
          cnameTarget: customDomain.cnameTarget,
          verificationToken: customDomain.verificationToken,
          lastCheckedAt: customDomain.lastCheckedAt?.toISOString() ?? null,
        }
      : null,
    emailConfig: emailConfig
      ? {
          senderDomain: emailConfig.senderDomain,
          senderEmail: emailConfig.senderEmail,
          verificationStatus: emailConfig.verificationStatus,
          leadDestinationEmails: emailConfig.leadDestinationEmails,
        }
      : null,
  });
}
