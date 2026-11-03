import { exigirSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashSenha } from "@/lib/usuarios";
import type { Role } from "@prisma/client";

export async function GET() {
  const admin = await exigirSuperAdmin();
  if (admin instanceof Response) return admin;

  const [tenants, aiAggregates] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        brandProfile: { select: { onboardingCompleted: true, websiteUrl: true } },
        customDomains: { select: { domain: true, dnsStatus: true, sslStatus: true } },
        members: {
          include: {
            user: { select: { id: true, email: true, fullName: true, isSuperAdmin: true } },
          },
        },
        _count: {
          select: {
            landingPages: true,
            leads: true,
            adCampaigns: true,
            socialPautas: true,
            socialPosts: true,
            mediaAssets: true,
          },
        },
      },
    }),
    prisma.aiUsageLog.groupBy({
      by: ["tenantId"],
      _sum: {
        inputTokens: true,
        outputTokens: true,
        creditsDeducted: true,
      },
      _count: { id: true },
    }),
  ]);

  const usageByTenant = new Map(
    aiAggregates.map((a) => [
      a.tenantId,
      {
        callsCount: a._count.id,
        inputTokens: a._sum.inputTokens ?? 0,
        outputTokens: a._sum.outputTokens ?? 0,
        creditsDeducted: a._sum.creditsDeducted ?? 0,
      },
    ])
  );

  return Response.json({
    tenants: tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      planTier: t.planTier,
      tokenCreditBalance: t.tokenCreditBalance,
      defaultLocale: t.defaultLocale,
      isActive: t.isActive,
      createdAt: t.createdAt.toISOString(),
      onboardingCompleted: t.brandProfile?.onboardingCompleted ?? false,
      websiteUrl: t.brandProfile?.websiteUrl ?? null,
      customDomains: t.customDomains,
      members: t.members.map((m) => ({
        userId: m.userId,
        role: m.role,
        email: m.user.email,
        fullName: m.user.fullName,
        isSuperAdmin: m.user.isSuperAdmin,
      })),
      counts: t._count,
      aiUsage: usageByTenant.get(t.id) ?? {
        callsCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        creditsDeducted: 0,
      },
    })),
  });
}

export async function POST(request: Request) {
  const admin = await exigirSuperAdmin();
  if (admin instanceof Response) return admin;

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    slug?: string;
    planTier?: string;
    tokenCreditBalance?: number;
    ownerEmail?: string;
    ownerName?: string;
    ownerPassword?: string;
  };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 120) {
    return Response.json({ error: "Nome do cliente é obrigatório (até 120 caracteres)" }, { status: 400 });
  }

  const rawSlug =
    typeof body.slug === "string" && body.slug.trim()
      ? body.slug.trim()
      : name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");

  if (!rawSlug) {
    return Response.json({ error: "Slug inválido" }, { status: 400 });
  }

  const existing = await prisma.tenant.findUnique({ where: { slug: rawSlug } });
  if (existing) {
    return Response.json({ error: `Já existe um tenant com o slug "${rawSlug}".` }, { status: 409 });
  }

  const planTier = typeof body.planTier === "string" && body.planTier ? body.planTier : "starter";
  const tokenCreditBalance =
    typeof body.tokenCreditBalance === "number" && Number.isFinite(body.tokenCreditBalance)
      ? Math.max(0, Math.round(body.tokenCreditBalance))
      : 100000;

  const tenant = await prisma.$transaction(async (tx) => {
    const created = await tx.tenant.create({
      data: {
        name,
        slug: rawSlug,
        planTier,
        tokenCreditBalance,
      },
    });

    await tx.brandProfile.create({
      data: {
        tenantId: created.id,
        onboardingCompleted: false,
      },
    });

    await tx.tenantEmailConfig.create({
      data: {
        tenantId: created.id,
        leadDestinationEmails: body.ownerEmail ? [body.ownerEmail.trim().toLowerCase()] : [admin.email],
        useStageFallback: true,
      },
    });

    if (body.ownerEmail && body.ownerEmail.trim()) {
      const email = body.ownerEmail.trim().toLowerCase();
      let ownerUser = await tx.user.findUnique({ where: { email } });
      if (!ownerUser) {
        const pwd = body.ownerPassword && body.ownerPassword.length >= 6 ? body.ownerPassword : "Mudar@123";
        const passwordHash = await hashSenha(pwd);
        ownerUser = await tx.user.create({
          data: {
            email,
            fullName: body.ownerName?.trim() || name,
            passwordHash,
            isSuperAdmin: false,
          },
        });
      }
      await tx.tenantMember.upsert({
        where: { tenantId_userId: { tenantId: created.id, userId: ownerUser.id } },
        create: { tenantId: created.id, userId: ownerUser.id, role: "OWNER" },
        update: { role: "OWNER" },
      });
    } else {
      await tx.tenantMember.upsert({
        where: { tenantId_userId: { tenantId: created.id, userId: admin.id } },
        create: { tenantId: created.id, userId: admin.id, role: "OWNER" },
        update: { role: "OWNER" },
      });
    }

    return created;
  });

  return Response.json({ tenant }, { status: 201 });
}

export async function PATCH(request: Request) {
  const admin = await exigirSuperAdmin();
  if (admin instanceof Response) return admin;

  const body = (await request.json().catch(() => ({}))) as {
    tenantId?: string;
    name?: string;
    planTier?: string;
    tokenCreditBalance?: number;
    addCredits?: number;
    isActive?: boolean;
    memberEmail?: string;
    memberName?: string;
    memberPassword?: string;
    memberRole?: Role;
  };

  if (!body.tenantId) {
    return Response.json({ error: "tenantId é obrigatório" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: body.tenantId } });
  if (!tenant) {
    return Response.json({ error: "Tenant não encontrado" }, { status: 404 });
  }

  const updateData: {
    name?: string;
    planTier?: string;
    tokenCreditBalance?: number | { increment: number };
    isActive?: boolean;
  } = {};

  if (typeof body.name === "string" && body.name.trim()) updateData.name = body.name.trim();
  if (typeof body.planTier === "string" && body.planTier.trim()) updateData.planTier = body.planTier.trim();
  if (typeof body.isActive === "boolean") updateData.isActive = body.isActive;
  if (typeof body.tokenCreditBalance === "number" && Number.isFinite(body.tokenCreditBalance)) {
    updateData.tokenCreditBalance = Math.max(0, Math.round(body.tokenCreditBalance));
  } else if (typeof body.addCredits === "number" && Number.isFinite(body.addCredits)) {
    updateData.tokenCreditBalance = { increment: Math.round(body.addCredits) };
  }

  const updated = await prisma.tenant.update({
    where: { id: tenant.id },
    data: updateData,
  });

  if (body.memberEmail && body.memberEmail.trim()) {
    const email = body.memberEmail.trim().toLowerCase();
    const role: Role =
      body.memberRole && ["OWNER", "ADMIN", "EDITOR", "VIEWER"].includes(body.memberRole)
        ? body.memberRole
        : "EDITOR";

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const pwd = body.memberPassword && body.memberPassword.length >= 6 ? body.memberPassword : "Mudar@123";
      const passwordHash = await hashSenha(pwd);
      user = await prisma.user.create({
        data: {
          email,
          fullName: body.memberName?.trim() || email.split("@")[0]!,
          passwordHash,
          isSuperAdmin: false,
        },
      });
    }

    await prisma.tenantMember.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      create: { tenantId: tenant.id, userId: user.id, role },
      update: { role },
    });
  }

  return Response.json({ ok: true, tenant: updated });
}
