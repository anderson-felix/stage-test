import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Role, ThemePreference } from "@prisma/client";
import prisma from "./prisma";
import type { ImpersonationInfo } from "./jwt";

const scrypt = promisify(scryptCb) as (senha: string, sal: Buffer, tamanho: number) => Promise<Buffer>;

export type Papel = "admin" | "membro";
export { Role, ThemePreference };

export const DEFAULT_TENANT_SLUG = "stage-consulting";
export const DEFAULT_TENANT_NAME = "Stage Consulting";

export type Usuario = {
  id: string;
  nome: string;
  fullName: string;
  email: string;
  papel: Papel;
  role: Role;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  isSuperAdmin: boolean;
  preferredLocale: string;
  themePreference: ThemePreference;
  completedTour: boolean;
  onboardingCompleted: boolean;
  tokenCreditBalance: number;
  impersonation?: ImpersonationInfo;
  ativo: boolean;
  /** Senha provisória: obriga a trocar no próximo acesso. */
  trocarSenha: boolean;
  criadoEm: string;
  /** Sessões emitidas antes disso são recusadas (troca de senha, desativação). */
  sessoesDesde: number;
  senhaHash: string;
};

export type UsuarioPublico = Omit<Usuario, "senhaHash" | "sessoesDesde">;

export const SENHA_MIN = 8;

/** Pasta de dados legada do hub (para importação transparente de usuarios.json se existir). */
export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR || "data");
}

const arquivoLegado = () => path.join(dataDir(), "usuarios.json");

type HashMeta = {
  trocarSenha: boolean;
  ativo: boolean;
  sessoesDesde: number;
};

export function parsePasswordHashMeta(guardado: string): HashMeta {
  const parts = guardado.split(":");
  if (parts.length >= 6 && parts[0] === "scrypt") {
    return {
      trocarSenha: parts[3] === "1",
      ativo: parts[4] !== "0",
      sessoesDesde: Number(parts[5]) || 0,
    };
  }
  return { trocarSenha: false, ativo: true, sessoesDesde: 0 };
}

export function encodePasswordHashWithMeta(baseHash: string, meta: HashMeta): string {
  const [alg, salHex, chaveHex] = baseHash.split(":");
  return `${alg}:${salHex}:${chaveHex}:${meta.trocarSenha ? "1" : "0"}:${meta.ativo ? "1" : "0"}:${meta.sessoesDesde}`;
}

export async function hashSenha(senha: string, meta: Partial<HashMeta> = {}): Promise<string> {
  const sal = randomBytes(16);
  const chave = await scrypt(senha, sal, 64);
  const base = `scrypt:${sal.toString("hex")}:${chave.toString("hex")}`;
  return encodePasswordHashWithMeta(base, {
    trocarSenha: meta.trocarSenha ?? false,
    ativo: meta.ativo ?? true,
    sessoesDesde: meta.sessoesDesde ?? 0,
  });
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const [alg, salHex, chaveHex] = guardado.split(":");
  if (alg !== "scrypt" || !salHex || !chaveHex) return false;
  const esperado = Buffer.from(chaveHex, "hex");
  const chave = await scrypt(senha, Buffer.from(salHex, "hex"), esperado.length);
  return timingSafeEqual(chave, esperado);
}

export function roleToPapel(role: Role, isSuperAdmin = false): Papel {
  if (isSuperAdmin || role === Role.OWNER || role === Role.ADMIN) return "admin";
  return "membro";
}

export function papelToRole(papel?: Papel | Role | string): Role {
  if (papel === Role.OWNER || papel === "OWNER") return Role.OWNER;
  if (papel === Role.ADMIN || papel === "ADMIN" || papel === "admin") return Role.ADMIN;
  if (papel === Role.VIEWER || papel === "VIEWER") return Role.VIEWER;
  return Role.EDITOR;
}

export function publico(u: Usuario): UsuarioPublico {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { senhaHash, sessoesDesde, ...resto } = u;
  return resto;
}

const normalizarEmail = (email: string) => email.trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validar(nome: string, email: string, senha?: string) {
  if (!nome.trim()) throw new Error("informe o nome");
  if (!EMAIL.test(normalizarEmail(email))) throw new Error("e-mail inválido");
  if (senha !== undefined && senha.length < SENHA_MIN) throw new Error(`a senha precisa ter ${SENHA_MIN}+ caracteres`);
}

/** Senha provisória legível (sem 0/O, 1/l). */
export function senhaProvisoria(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/** Garante que o tenant inicial stage-consulting existe no banco. */
export async function garantirTenantInicial() {
  return prisma.tenant.upsert({
    where: { slug: DEFAULT_TENANT_SLUG },
    update: {},
    create: {
      name: DEFAULT_TENANT_NAME,
      slug: DEFAULT_TENANT_SLUG,
      planTier: "enterprise",
      tokenCreditBalance: 100000,
      defaultLocale: "pt-BR",
      themePreference: ThemePreference.DARK,
      isActive: true,
    },
    include: {
      brandProfile: true,
    },
  });
}

type UsuarioLegadoJson = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  trocarSenha: boolean;
  criadoEm: string;
  sessoesDesde: number;
  senhaHash: string;
};

let jaSincronizouLegado = false;

/** Migra usuarios.json legado para o banco PostgreSQL de forma idempotente se o arquivo existir. */
export async function sincronizarUsuariosLegados(): Promise<number> {
  if (jaSincronizouLegado) return 0;
  jaSincronizouLegado = true;
  let listaLegada: UsuarioLegadoJson[] = [];
  try {
    const raw = await fs.readFile(/*turbopackIgnore: true*/ arquivoLegado(), "utf8");
    listaLegada = JSON.parse(raw) as UsuarioLegadoJson[];
  } catch {
    return 0;
  }
  if (!Array.isArray(listaLegada) || listaLegada.length === 0) return 0;

  const tenant = await garantirTenantInicial();
  let importados = 0;

  for (const u of listaLegada) {
    const email = normalizarEmail(u.email);
    const passwordHash = encodePasswordHashWithMeta(u.senhaHash, {
      trocarSenha: !!u.trocarSenha,
      ativo: u.ativo !== false,
      sessoesDesde: Number(u.sessoesDesde) || 0,
    });
    const role = u.papel === "admin" ? Role.OWNER : Role.EDITOR;
    const isSuperAdmin = u.papel === "admin";

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        id: u.id,
        email,
        fullName: u.nome.trim() || email,
        passwordHash,
        isSuperAdmin,
        preferredLocale: "pt-BR",
        themePreference: ThemePreference.DARK,
        completedTour: false,
        createdAt: u.criadoEm ? new Date(u.criadoEm) : new Date(),
      },
    });

    await prisma.tenantMember.upsert({
      where: {
        tenantId_userId: {
          tenantId: tenant.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: user.id,
        role,
      },
    });
    importados++;
  }
  return importados;
}

function mapUserToUsuario(
  user: {
    id: string;
    email: string;
    passwordHash: string;
    fullName: string;
    preferredLocale: string;
    themePreference: ThemePreference;
    isSuperAdmin: boolean;
    completedTour: boolean;
    createdAt: Date;
  },
  tenant: {
    id: string;
    name: string;
    slug: string;
    tokenCreditBalance: number;
    brandProfile?: { onboardingCompleted: boolean } | null;
  },
  role: Role,
  impersonation?: ImpersonationInfo
): Usuario {
  const meta = parsePasswordHashMeta(user.passwordHash);
  return {
    id: user.id,
    nome: user.fullName,
    fullName: user.fullName,
    email: user.email,
    papel: roleToPapel(role, user.isSuperAdmin),
    role,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    isSuperAdmin: user.isSuperAdmin,
    preferredLocale: user.preferredLocale || "pt-BR",
    themePreference: user.themePreference || ThemePreference.DARK,
    completedTour: user.completedTour,
    onboardingCompleted: tenant.brandProfile?.onboardingCompleted ?? true,
    tokenCreditBalance: tenant.tokenCreditBalance,
    impersonation,
    ativo: meta.ativo,
    trocarSenha: meta.trocarSenha,
    criadoEm: user.createdAt.toISOString(),
    sessoesDesde: meta.sessoesDesde,
    senhaHash: user.passwordHash,
  };
}

export async function listarUsuarios(tenantId?: string): Promise<Usuario[]> {
  await sincronizarUsuariosLegados();

  if (tenantId) {
    const members = await prisma.tenantMember.findMany({
      where: { tenantId },
      include: {
        user: true,
        tenant: { include: { brandProfile: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return members.map((m) => mapUserToUsuario(m.user, m.tenant, m.role));
  }

  const allUsers = await prisma.user.findMany({
    include: {
      memberships: {
        include: {
          tenant: { include: { brandProfile: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (allUsers.length === 0) return [];
  const fallbackTenant = await garantirTenantInicial();

  return allUsers.map((u) => {
    const primary = u.memberships[0];
    return mapUserToUsuario(
      u,
      primary?.tenant ?? fallbackTenant,
      primary?.role ?? (u.isSuperAdmin ? Role.OWNER : Role.EDITOR)
    );
  });
}

export async function criarUsuario(dados: {
  nome: string;
  email: string;
  papel?: Papel | Role | string;
  role?: Role;
  senha: string;
  trocarSenha: boolean;
  tenantId?: string;
  isSuperAdmin?: boolean;
}): Promise<Usuario> {
  await sincronizarUsuariosLegados();
  validar(dados.nome, dados.email, dados.senha);

  const email = normalizarEmail(dados.email);
  const totalUsers = await prisma.user.count();
  const isFirstUser = totalUsers === 0;

  const tenant = dados.tenantId
    ? await prisma.tenant.findUnique({
      where: { id: dados.tenantId },
      include: { brandProfile: true },
    })
    : await garantirTenantInicial();

  if (!tenant) throw new Error("Tenant não encontrado");

  const role = dados.role ?? (isFirstUser ? Role.OWNER : papelToRole(dados.papel));
  const isSuperAdmin = dados.isSuperAdmin ?? isFirstUser;

  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { memberships: true },
  });

  if (existingUser) {
    const alreadyMember = existingUser.memberships.some((m) => m.tenantId === tenant.id);
    if (alreadyMember) {
      throw new Error("já existe um usuário com esse e-mail neste cliente");
    }
    await prisma.tenantMember.create({
      data: {
        tenantId: tenant.id,
        userId: existingUser.id,
        role,
      },
    });
    return mapUserToUsuario(existingUser, tenant, role);
  }

  const passwordHash = await hashSenha(dados.senha, {
    trocarSenha: dados.trocarSenha,
    ativo: true,
    sessoesDesde: 0,
  });

  const created = await prisma.user.create({
    data: {
      email,
      fullName: dados.nome.trim(),
      passwordHash,
      isSuperAdmin,
      preferredLocale: tenant.defaultLocale || "pt-BR",
      themePreference: tenant.themePreference || ThemePreference.DARK,
      memberships: {
        create: {
          tenantId: tenant.id,
          role,
        },
      },
    },
  });

  return mapUserToUsuario(created, tenant, role);
}

/** Confere e-mail e senha. Devolve o usuário ativo ou null (sem dizer qual dos dois errou). */
export async function autenticar(email: string, senha: string, preferredTenantId?: string): Promise<Usuario | null> {
  await sincronizarUsuariosLegados();
  const normEmail = normalizarEmail(email);
  const u = await prisma.user.findUnique({
    where: { email: normEmail },
    include: {
      memberships: {
        include: {
          tenant: { include: { brandProfile: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!u) {
    await hashSenha(senha); // mesmo custo de tempo quando o e-mail não existe
    return null;
  }

  const meta = parsePasswordHashMeta(u.passwordHash);
  if (!(await conferirSenha(senha, u.passwordHash)) || !meta.ativo) {
    return null;
  }

  const activeMemberships = u.memberships.filter((m) => m.tenant.isActive);
  let chosen = preferredTenantId
    ? activeMemberships.find((m) => m.tenantId === preferredTenantId)
    : activeMemberships[0];

  if (!chosen && u.isSuperAdmin) {
    const defaultTenant = await garantirTenantInicial();
    await prisma.tenantMember.upsert({
      where: {
        tenantId_userId: { tenantId: defaultTenant.id, userId: u.id },
      },
      update: {},
      create: {
        tenantId: defaultTenant.id,
        userId: u.id,
        role: Role.OWNER,
      },
    });
    return mapUserToUsuario(u, defaultTenant, Role.OWNER);
  }

  if (!chosen) return null;
  return mapUserToUsuario(u, chosen.tenant, chosen.role);
}

export async function buscarUsuario(
  id: string,
  tenantId?: string,
  impersonation?: ImpersonationInfo
): Promise<Usuario | null> {
  await sincronizarUsuariosLegados();
  const u = await prisma.user.findUnique({
    where: { id },
    include: {
      memberships: {
        include: {
          tenant: { include: { brandProfile: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!u) return null;

  if (impersonation && u.isSuperAdmin) {
    const impTenant = await prisma.tenant.findUnique({
      where: { id: impersonation.tenantId },
      include: { brandProfile: true },
    });
    if (impTenant && impTenant.isActive) {
      return mapUserToUsuario(u, impTenant, Role.OWNER, impersonation);
    }
  }

  const activeMemberships = u.memberships.filter((m) => m.tenant.isActive);
  const chosen = tenantId
    ? activeMemberships.find((m) => m.tenantId === tenantId)
    : activeMemberships[0];

  if (chosen) {
    return mapUserToUsuario(u, chosen.tenant, chosen.role);
  }

  if (u.isSuperAdmin) {
    const targetTenant = tenantId
      ? await prisma.tenant.findUnique({ where: { id: tenantId }, include: { brandProfile: true } })
      : await garantirTenantInicial();
    if (targetTenant && targetTenant.isActive) {
      return mapUserToUsuario(u, targetTenant, Role.OWNER);
    }
  }

  return null;
}

/** A sessão (id + momento de emissão, em segundos) ainda vale e está vinculada ao tenant? */
export async function sessaoValida(
  id: string,
  emitidaEm: number,
  tenantId?: string,
  impersonation?: ImpersonationInfo
): Promise<Usuario | null> {
  const u = await buscarUsuario(id, tenantId, impersonation);
  if (!u || !u.ativo || emitidaEm * 1000 < u.sessoesDesde) return null;
  return u;
}

export type MudancaUsuario = {
  nome?: string;
  papel?: Papel | Role | string;
  role?: Role;
  ativo?: boolean;
  senha?: string;
  trocarSenha?: boolean;
  preferredLocale?: string;
  themePreference?: ThemePreference;
  completedTour?: boolean;
};

export async function alterarUsuario(id: string, m: MudancaUsuario, tenantId?: string): Promise<Usuario> {
  if (m.senha !== undefined && m.senha.length < SENHA_MIN) {
    throw new Error(`a senha precisa ter ${SENHA_MIN}+ caracteres`);
  }
  if (m.nome !== undefined && !m.nome.trim()) {
    throw new Error("informe o nome");
  }

  const u = await prisma.user.findUnique({
    where: { id },
    include: {
      memberships: {
        include: {
          tenant: { include: { brandProfile: true } },
        },
      },
    },
  });
  if (!u) throw new Error("usuário não encontrado");

  const targetTenantId = tenantId ?? u.memberships[0]?.tenantId ?? (await garantirTenantInicial()).id;
  const membership = u.memberships.find((mem) => mem.tenantId === targetTenantId);
  if (tenantId && !membership && !u.isSuperAdmin) {
    throw new Error("usuário não pertence a este tenant");
  }

  const metaAtual = parsePasswordHashMeta(u.passwordHash);
  const novoAtivo = m.ativo !== undefined ? m.ativo : metaAtual.ativo;
  const novoTrocarSenha = m.trocarSenha !== undefined ? m.trocarSenha : metaAtual.trocarSenha;
  const novoSessoesDesde =
    m.senha !== undefined || m.ativo === false ? Date.now() - 1000 : metaAtual.sessoesDesde;

  const novoRole =
    m.role !== undefined
      ? m.role
      : m.papel !== undefined
        ? papelToRole(m.papel)
        : (membership?.role ?? Role.EDITOR);

  // Garantir ao menos um administrador/owner ativo no tenant
  const tenantMembers = await prisma.tenantMember.findMany({
    where: { tenantId: targetTenantId },
    include: { user: true },
  });

  const adminsRestantes = tenantMembers.filter((tm) => {
    const roleEfetivo = tm.userId === id ? novoRole : tm.role;
    const ativoEfetivo = tm.userId === id ? novoAtivo : parsePasswordHashMeta(tm.user.passwordHash).ativo;
    return ativoEfetivo && (roleEfetivo === Role.OWNER || roleEfetivo === Role.ADMIN || tm.user.isSuperAdmin);
  });

  if (adminsRestantes.length === 0) {
    throw new Error("o hub precisa de pelo menos um administrador ativo");
  }

  const novoPasswordHash =
    m.senha !== undefined
      ? await hashSenha(m.senha, {
        trocarSenha: novoTrocarSenha,
        ativo: novoAtivo,
        sessoesDesde: novoSessoesDesde,
      })
      : encodePasswordHashWithMeta(u.passwordHash, {
        trocarSenha: novoTrocarSenha,
        ativo: novoAtivo,
        sessoesDesde: novoSessoesDesde,
      });

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        ...(m.nome !== undefined ? { fullName: m.nome.trim() } : {}),
        ...(m.preferredLocale !== undefined ? { preferredLocale: m.preferredLocale } : {}),
        ...(m.themePreference !== undefined ? { themePreference: m.themePreference } : {}),
        ...(m.completedTour !== undefined ? { completedTour: m.completedTour } : {}),
        passwordHash: novoPasswordHash,
      },
    });

    if (membership && (m.role !== undefined || m.papel !== undefined)) {
      await tx.tenantMember.update({
        where: {
          tenantId_userId: {
            tenantId: targetTenantId,
            userId: id,
          },
        },
        data: { role: novoRole },
      });
    }
  });

  const atualizado = await buscarUsuario(id, targetTenantId);
  if (!atualizado) throw new Error("erro ao recarregar usuário");
  return atualizado;
}
