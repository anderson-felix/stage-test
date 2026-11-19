import { exigirSessao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function GET() {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const tenantId = sessao.tenantId;
  const [tenant, brandProfile, customDomain, emailConfig] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.brandProfile.findUnique({ where: { tenantId } }),
    prisma.customDomain.findFirst({ where: { tenantId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] }),
    prisma.tenantEmailConfig.findUnique({ where: { tenantId } }),
  ]);

  return Response.json({
    tenant: {
      id: tenant?.id ?? tenantId,
      name: tenant?.name ?? sessao.tenantName,
      slug: tenant?.slug ?? sessao.tenantSlug,
    },
    brandProfile: brandProfile ?? {
      tenantId,
      businessContext: "",
      toneOfVoice: "",
      brandRules: "",
      currentFocus: "",
      websiteUrl: "",
      logoBlobUrl: null,
      visualGuideJson: null,
      onboardingCompleted: false,
    },
    customDomain,
    emailConfig: emailConfig ?? {
      tenantId,
      senderDomain: null,
      senderEmail: null,
      senderName: tenant?.name ?? sessao.tenantName,
      leadDestinationEmails: [sessao.email],
      verificationStatus: "PENDING",
      useStageFallback: true,
    },
  });
}

export async function PUT(request: Request) {
  const sessao = await exigirSessao("EDITOR");
  if (sessao instanceof Response) return sessao;

  const tenantId = sessao.tenantId;
  const body = (await request.json().catch(() => ({}))) as {
    tenantName?: string;
    businessContext?: string;
    toneOfVoice?: string;
    brandRules?: string;
    currentFocus?: string;
    websiteUrl?: string;
    logoBlobUrl?: string | null;
    visualGuideJson?: Record<string, unknown> | null;
    leadDestinationEmails?: string[];
    useStageFallback?: boolean;
    onboardingCompleted?: boolean;
  };

  if (typeof body.tenantName === "string" && body.tenantName.trim()) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { name: body.tenantName.trim().slice(0, 120) },
    });
  }

  const updateData: Prisma.BrandProfileUpdateInput = {};
  if (typeof body.businessContext === "string") updateData.businessContext = body.businessContext;
  if (typeof body.toneOfVoice === "string") updateData.toneOfVoice = body.toneOfVoice;
  if (typeof body.brandRules === "string") updateData.brandRules = body.brandRules;
  if (typeof body.currentFocus === "string") updateData.currentFocus = body.currentFocus;
  if (typeof body.websiteUrl === "string") updateData.websiteUrl = body.websiteUrl.trim() || null;
  if (body.logoBlobUrl !== undefined) updateData.logoBlobUrl = body.logoBlobUrl;
  if (body.visualGuideJson !== undefined && body.visualGuideJson !== null) {
    updateData.visualGuideJson = body.visualGuideJson as Prisma.InputJsonValue;
  }
  if (typeof body.onboardingCompleted === "boolean") {
    updateData.onboardingCompleted = body.onboardingCompleted;
  }

  const brandProfile = await prisma.brandProfile.upsert({
    where: { tenantId },
    create: {
      tenantId,
      businessContext: typeof body.businessContext === "string" ? body.businessContext : "",
      toneOfVoice: typeof body.toneOfVoice === "string" ? body.toneOfVoice : "",
      brandRules: typeof body.brandRules === "string" ? body.brandRules : "",
      currentFocus: typeof body.currentFocus === "string" ? body.currentFocus : "",
      websiteUrl: typeof body.websiteUrl === "string" ? body.websiteUrl.trim() || null : null,
      logoBlobUrl: body.logoBlobUrl ?? null,
      visualGuideJson: (body.visualGuideJson ?? undefined) as Prisma.InputJsonValue | undefined,
      onboardingCompleted: Boolean(body.onboardingCompleted),
    },
    update: updateData,
  });

  if (Array.isArray(body.leadDestinationEmails)) {
    const validEmails = body.leadDestinationEmails
      .map((e) => String(e).trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    await prisma.tenantEmailConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        leadDestinationEmails: validEmails.length > 0 ? validEmails : [sessao.email],
        useStageFallback: body.useStageFallback ?? true,
      },
      update: {
        leadDestinationEmails: validEmails,
        ...(typeof body.useStageFallback === "boolean" ? { useStageFallback: body.useStageFallback } : {}),
      },
    });
  }

  return Response.json({ ok: true, brandProfile });
}

