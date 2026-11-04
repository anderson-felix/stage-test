import { cookies } from "next/headers";
import { exigirSessao, createSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

// POST { tenantId } alterna o tenant ativo da sessão autenticada
export async function POST(request: Request) {
  const sessao = await exigirSessao("VIEWER");
  if (sessao instanceof Response) return sessao;

  const body = (await request.json().catch(() => ({}))) as { tenantId?: string };
  const targetTenantId = body.tenantId?.trim();

  if (!targetTenantId) {
    return Response.json({ error: "tenantId obrigatório" }, { status: 400 });
  }

  const targetTenant = await prisma.tenant.findUnique({
    where: { id: targetTenantId },
  });

  if (!targetTenant || !targetTenant.isActive) {
    return Response.json({ error: "Tenant não encontrado ou inativo" }, { status: 404 });
  }

  let targetRole: Role = "VIEWER";

  if (sessao.isSuperAdmin) {
    const existingMember = await prisma.tenantMember.findUnique({
      where: {
        tenantId_userId: {
          tenantId: targetTenant.id,
          userId: sessao.id,
        },
      },
    });
    targetRole = existingMember ? existingMember.role : "OWNER";
  } else {
    const membership = await prisma.tenantMember.findUnique({
      where: {
        tenantId_userId: {
          tenantId: targetTenant.id,
          userId: sessao.id,
        },
      },
    });

    if (!membership) {
      return Response.json({ error: "Você não possui acesso a esta empresa" }, { status: 403 });
    }
    targetRole = membership.role;
  }

  const sessionCookie = await createSession(
    {
      id: sessao.id,
      email: sessao.email,
      fullName: sessao.nome,
      tenantId: targetTenant.id,
      tenantName: targetTenant.name,
      role: targetRole,
      isSuperAdmin: sessao.isSuperAdmin,
      trocarSenha: sessao.trocarSenha,
      preferredLocale: sessao.preferredLocale,
      themePreference: sessao.themePreference,
    },
    sessao.impersonation
  );

  const cookieStore = await cookies();
  cookieStore.set(sessionCookie.name, sessionCookie.value, sessionCookie);

  return Response.json({
    ok: true,
    tenantId: targetTenant.id,
    tenantName: targetTenant.name,
    tenantSlug: targetTenant.slug,
    role: targetRole,
  });
}

