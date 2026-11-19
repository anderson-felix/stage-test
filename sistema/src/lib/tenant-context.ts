import { redirect } from "next/navigation";
import { garantirTenantInicial } from "./usuarios";
import type { Role } from "@prisma/client";

export type TenantContext = {
  userId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: Role;
  isSuperAdmin: boolean;
  impersonating: boolean;
};

/**
 * Contexto multi-tenant da requisição atual, derivado exclusivamente da sessão autenticada (JWT
 * validado contra TenantMember no PostgreSQL). Retorna null quando não há sessão válida.
 * Nunca confia em tenantId vindo de body/query/params.
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const { usuarioAtual } = await import("./auth");
  const u = await usuarioAtual();
  if (!u || !u.tenantId) return null;
  return {
    userId: u.id,
    tenantId: u.tenantId,
    tenantName: u.tenantName,
    tenantSlug: u.tenantSlug,
    role: u.role,
    isSuperAdmin: u.isSuperAdmin,
    impersonating: Boolean(u.impersonation),
  };
}

/**
 * Contexto obrigatório para Server Components de `src/app/(hub)/**`: redireciona para /login sem sessão.
 */
export async function requireTenantContext(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) {
    redirect("/login");
  }
  return ctx;
}

/**
 * Resolve o tenantId ativo de forma segura:
 * 1. Se `tenantId` explícito foi fornecido pelo chamador (já validado na rota), usa-o imediatamente.
 * 2. Se chamado em Server Component / Route Handler sem argumento, extrai da sessão autenticada.
 * 3. Apenas em scripts CLI fora do ciclo de request do Next.js (seed/worker), usa o tenant inicial.
 */
export async function resolverTenantId(tenantId?: string): Promise<string> {
  if (tenantId && tenantId.trim()) {
    return tenantId.trim();
  }
  try {
    const ctx = await getTenantContext();
    if (ctx?.tenantId) {
      return ctx.tenantId;
    }
  } catch {
    // Chamado fora de contexto de request HTTP (ex.: script de seed/worker)
    const t = await garantirTenantInicial();
    return t.id;
  }
  throw new Error("Sessão ausente: não é possível resolver o tenant desta requisição");
}

export const getTenantIdOrThrow = resolverTenantId;
