import { cookies } from "next/headers";
import { SESSION_COOKIE, createSession } from "@/lib/auth";
import { LOCALE_COOKIE, THEME_COOKIE } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import {
  conferirSenha,
  garantirTenantInicial,
  hashSenha,
  parsePasswordHashMeta,
  Role,
} from "@/lib/usuarios";

// GET diz se o hub ainda não tem usuários no banco (a tela de login vira "criar administrador").
export async function GET() {
  const count = await prisma.user.count();
  return Response.json({ precisaSetup: count === 0 });
}

// POST { email, senha, tenantId? } autentica via Prisma e abre a sessão JWT multi-tenant
export async function POST(request: Request) {
  const { email, senha, tenantId } = (await request.json().catch(() => ({}))) as {
    email?: string;
    senha?: string;
    tenantId?: string;
  };
  if (!email || !senha) {
    return Response.json({ error: "informe e-mail e senha" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      memberships: {
        include: {
          tenant: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user) {
    await hashSenha(senha);
    return Response.json({ error: "e-mail ou senha incorretos" }, { status: 401 });
  }

  const meta = parsePasswordHashMeta(user.passwordHash);
  if (!(await conferirSenha(senha, user.passwordHash)) || !meta.ativo) {
    return Response.json({ error: "e-mail ou senha incorretos" }, { status: 401 });
  }

  const activeMemberships = user.memberships.filter((m) => m.tenant.isActive);
  let selectedMembership = tenantId
    ? activeMemberships.find((m) => m.tenantId === tenantId)
    : activeMemberships[0];

  if (!selectedMembership && user.isSuperAdmin) {
    const defaultTenant = await garantirTenantInicial();
    const createdMember = await prisma.tenantMember.upsert({
      where: {
        tenantId_userId: {
          tenantId: defaultTenant.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        tenantId: defaultTenant.id,
        userId: user.id,
        role: Role.OWNER,
      },
      include: { tenant: true },
    });
    selectedMembership = createdMember;
  }

  if (!selectedMembership) {
    return Response.json({ error: "usuário sem empresa ativa vinculada" }, { status: 403 });
  }

  const cookieStore = await cookies();
  const sessionCookie = await createSession({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    tenantId: selectedMembership.tenant.id,
    tenantName: selectedMembership.tenant.name,
    role: selectedMembership.role,
    isSuperAdmin: user.isSuperAdmin,
    trocarSenha: meta.trocarSenha,
    preferredLocale: user.preferredLocale || "pt-BR",
    themePreference: user.themePreference || "DARK",
  });

  cookieStore.set(sessionCookie);
  cookieStore.set(LOCALE_COOKIE, user.preferredLocale || "pt-BR", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  cookieStore.set(THEME_COOKIE, user.themePreference || "DARK", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return Response.json({
    ok: true,
    trocarSenha: meta.trocarSenha,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      tenantId: selectedMembership.tenant.id,
      tenantName: selectedMembership.tenant.name,
      role: selectedMembership.role,
      isSuperAdmin: user.isSuperAdmin,
    },
  });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  cookieStore.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
