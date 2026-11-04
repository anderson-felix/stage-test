import { cookies } from "next/headers";
import { createSession, exigirSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { garantirTenantInicial } from "@/lib/usuarios";

export async function POST(request: Request) {
  const admin = await exigirSuperAdmin();
  if (admin instanceof Response) return admin;

  const body = (await request.json().catch(() => ({}))) as { tenantId?: string };
  if (!body.tenantId) {
    return Response.json({ error: "tenantId é obrigatório" }, { status: 400 });
  }

  const targetTenant = await prisma.tenant.findUnique({ where: { id: body.tenantId } });
  if (!targetTenant) {
    return Response.json({ error: "Tenant não encontrado" }, { status: 404 });
  }

  await prisma.aiUsageLog.create({
    data: {
      tenantId: targetTenant.id,
      userId: admin.id,
      featureModule: "admin:impersonate_start",
      modelName: "audit",
      inputTokens: 0,
      outputTokens: 0,
      creditsDeducted: 0,
    },
  });

  const sessionCookie = await createSession(
    {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      tenantId: targetTenant.id,
      tenantName: targetTenant.name,
      role: "OWNER",
      isSuperAdmin: true,
      trocarSenha: false,
      preferredLocale: admin.preferredLocale,
      themePreference: admin.themePreference,
    },
    {
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.nome,
      tenantId: targetTenant.id,
      tenantName: targetTenant.name,
      startedAt: Date.now(),
    }
  );

  const cookieStore = await cookies();
  cookieStore.set(sessionCookie);

  return Response.json({
    ok: true,
    impersonating: {
      tenantId: targetTenant.id,
      tenantName: targetTenant.name,
      tenantSlug: targetTenant.slug,
    },
  });
}

export async function DELETE() {
  const admin = await exigirSuperAdmin();
  if (admin instanceof Response) return admin;

  const defaultTenant = await garantirTenantInicial();
  const membership = await prisma.tenantMember.findFirst({
    where: { userId: admin.id },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });

  const homeTenantId = membership?.tenantId ?? defaultTenant.id;
  const homeTenantName = membership?.tenant.name ?? defaultTenant.name;

  await prisma.aiUsageLog.create({
    data: {
      tenantId: admin.tenantId,
      userId: admin.id,
      featureModule: "admin:impersonate_end",
      modelName: "audit",
      inputTokens: 0,
      outputTokens: 0,
      creditsDeducted: 0,
    },
  });

  const sessionCookie = await createSession({
    id: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    tenantId: homeTenantId,
    tenantName: homeTenantName,
    role: membership?.role ?? "OWNER",
    isSuperAdmin: true,
    trocarSenha: false,
    preferredLocale: admin.preferredLocale,
    themePreference: admin.themePreference,
  });

  const cookieStore = await cookies();
  cookieStore.set(sessionCookie);

  return Response.json({ ok: true, restoredTenantId: homeTenantId });
}
