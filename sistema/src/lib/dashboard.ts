import prisma from "./prisma";

export type DashboardData = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    planTier: string;
    tokenCreditBalance: number;
  };
  credits: {
    balance: number;
    consumed30d: number;
    calls30d: number;
    recent: { id: string; featureModule: string; creditsDeducted: number; createdAt: string }[];
  };
  lps: { total: number; published: number; totalViews: number };
  leads: { total: number; last7d: number; conversionRate: number };
  domain: { domain: string; dnsStatus: string; sslStatus: string } | null;
  email: {
    verificationStatus: string;
    senderEmail: string | null;
    useStageFallback: boolean;
  } | null;
  ads: { total: number; byStatus: Record<string, number>; linkedToLp: number };
  social: {
    pautas: number;
    posts: number;
    scheduled: number;
    published: number;
    connectedAccounts: string[];
  };
  brand: { onboardingCompleted: boolean; filled: number; total: number };
};

/** Métricas do Dashboard estritamente filtradas pelo tenantId da sessão. */
export async function getDashboardData(tenantId: string): Promise<DashboardData> {
  const desde30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const desde7 = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [
    tenant,
    usageAgg,
    usageRecent,
    lps,
    leadsTotal,
    leads7d,
    domain,
    email,
    campaigns,
    pautas,
    postsByStatus,
    accounts,
    brand,
  ] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, planTier: true, tokenCreditBalance: true },
    }),
    prisma.aiUsageLog.aggregate({
      where: { tenantId, createdAt: { gte: desde30 } },
      _sum: { creditsDeducted: true },
      _count: { _all: true },
    }),
    prisma.aiUsageLog.findMany({
      where: { tenantId, creditsDeducted: { gt: 0 } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, featureModule: true, creditsDeducted: true, createdAt: true },
    }),
    prisma.landingPage.findMany({
      where: { tenantId },
      select: { status: true, viewsCount: true },
    }),
    prisma.lpLead.count({ where: { tenantId } }),
    prisma.lpLead.count({ where: { tenantId, createdAt: { gte: desde7 } } }),
    prisma.customDomain.findFirst({
      where: { tenantId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: { domain: true, dnsStatus: true, sslStatus: true },
    }),
    prisma.tenantEmailConfig.findUnique({
      where: { tenantId },
      select: { verificationStatus: true, senderEmail: true, useStageFallback: true },
    }),
    prisma.adCampaign.findMany({
      where: { tenantId },
      select: { status: true, landingPageId: true },
    }),
    prisma.socialPauta.count({ where: { tenantId } }),
    prisma.socialPost.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true },
    }),
    prisma.socialAccount.findMany({
      where: { tenantId, accessTokenEnc: { not: null } },
      select: { platform: true },
    }),
    prisma.brandProfile.findUnique({ where: { tenantId } }),
  ]);

  if (!tenant) throw new Error("Tenant não encontrado");

  const totalViews = lps.reduce((acc, lp) => acc + lp.viewsCount, 0);
  const published = lps.filter((lp) => lp.status === "PUBLISHED").length;
  const byStatus: Record<string, number> = {};
  for (const c of campaigns) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  const postCount = (s: string) => postsByStatus.find((p) => p.status === s)?._count._all ?? 0;
  const totalPosts = postsByStatus.reduce((a, p) => a + p._count._all, 0);

  const brandChecks = [
    (brand?.businessContext?.trim().length ?? 0) > 20,
    (brand?.toneOfVoice?.trim().length ?? 0) > 20 || (brand?.brandRules?.trim().length ?? 0) > 20,
    (brand?.currentFocus?.trim().length ?? 0) > 20,
    Boolean(brand?.visualGuideJson),
  ];

  return {
    tenant,
    credits: {
      balance: tenant.tokenCreditBalance,
      consumed30d: usageAgg._sum.creditsDeducted ?? 0,
      calls30d: usageAgg._count._all,
      recent: usageRecent.map((u) => ({
        id: u.id,
        featureModule: u.featureModule,
        creditsDeducted: u.creditsDeducted,
        createdAt: u.createdAt.toISOString(),
      })),
    },
    lps: { total: lps.length, published, totalViews },
    leads: {
      total: leadsTotal,
      last7d: leads7d,
      conversionRate: totalViews > 0 ? Number(((leadsTotal / totalViews) * 100).toFixed(2)) : 0,
    },
    domain,
    email,
    ads: {
      total: campaigns.length,
      byStatus,
      linkedToLp: campaigns.filter((c) => c.landingPageId).length,
    },
    social: {
      pautas,
      posts: totalPosts,
      scheduled: postCount("SCHEDULED"),
      published: postCount("PUBLISHED"),
      connectedAccounts: accounts.map((a) => a.platform),
    },
    brand: {
      onboardingCompleted: brand?.onboardingCompleted ?? false,
      filled: brandChecks.filter(Boolean).length,
      total: brandChecks.length,
    },
  };
}

