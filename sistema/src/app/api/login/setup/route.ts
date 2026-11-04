import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createSession } from "@/lib/auth";
import { LOCALE_COOKIE, THEME_COOKIE } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { hashSenha, Role, SENHA_MIN, ThemePreference } from "@/lib/usuarios";

function mesmaChave(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * POST { chave?, nome, email, senha, preferredLocale?, themePreference? }
 * Cria o primeiro Tenant ("Stage Consulting", slug: "stage-consulting"),
 * o primeiro User com isSuperAdmin: true e o vínculo TenantMember (role: 'OWNER')
 * quando prisma.user.count() === 0.
 */
export async function POST(request: Request) {
  const totalUsers = await prisma.user.count();
  if (totalUsers > 0) {
    return Response.json({ error: "o hub já possui usuários cadastrados" }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    chave?: string;
    nome?: string;
    email?: string;
    senha?: string;
    preferredLocale?: string;
    themePreference?: string;
  };

  const esperado = process.env.HUB_PASSWORD;
  if (esperado && body.chave && !mesmaChave(body.chave, esperado)) {
    return Response.json({ error: "chave de instalação incorreta" }, { status: 401 });
  }
  if (esperado && !body.chave && process.env.NODE_ENV === "production") {
    return Response.json({ error: "informe a chave de instalação" }, { status: 401 });
  }

  const fullName = (body.nome ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const senha = body.senha ?? "";

  if (!fullName) {
    return Response.json({ error: "informe o nome" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "e-mail inválido" }, { status: 400 });
  }
  if (senha.length < SENHA_MIN) {
    return Response.json(
      { error: `a senha precisa ter ${SENHA_MIN}+ caracteres` },
      { status: 400 }
    );
  }

  const preferredLocale =
    body.preferredLocale && ["pt-BR", "en-US", "es-ES"].includes(body.preferredLocale)
      ? body.preferredLocale
      : "pt-BR";
  const themePreference =
    body.themePreference === "LIGHT"
      ? ThemePreference.LIGHT
      : body.themePreference === "SYSTEM"
        ? ThemePreference.SYSTEM
        : ThemePreference.DARK;

  try {
    const passwordHash = await hashSenha(senha, {
      trocarSenha: false,
      ativo: true,
      sessoesDesde: 0,
    });

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { slug: "stage-consulting" },
        update: {},
        create: {
          name: "Stage Consulting",
          slug: "stage-consulting",
          planTier: "enterprise",
          tokenCreditBalance: 100000,
          defaultLocale: preferredLocale,
          themePreference,
          isActive: true,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          fullName,
          passwordHash,
          isSuperAdmin: true,
          preferredLocale,
          themePreference,
        },
      });

      await tx.tenantMember.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: Role.OWNER,
        },
      });

      return { tenant, user };
    });

    const cookieStore = await cookies();
    const sessionCookie = await createSession({
      id: result.user.id,
      email: result.user.email,
      fullName: result.user.fullName,
      tenantId: result.tenant.id,
      tenantName: result.tenant.name,
      role: Role.OWNER,
      isSuperAdmin: true,
      trocarSenha: false,
      preferredLocale,
      themePreference,
    });

    cookieStore.set(sessionCookie);
    cookieStore.set(LOCALE_COOKIE, preferredLocale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    cookieStore.set(THEME_COOKIE, themePreference, { path: "/", maxAge: 60 * 60 * 24 * 365 });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
