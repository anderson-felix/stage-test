import { garantirTenantInicial } from "./usuarios";

/**
 * Resolve o tenantId ativo de forma segura:
 * 1. Se `tenantId` explícito foi fornecido pelo chamador (já validado na rota), usa-o imediatamente.
 * 2. Se chamado em Server Component / Route Handler sem argumento, extrai da sessão autenticada.
 * 3. Apenas em scripts CLI fora do ciclo de request do Next.js, usa o tenant inicial.
 */
export async function resolverTenantId(tenantId?: string): Promise<string> {
  if (tenantId && tenantId.trim()) {
    return tenantId.trim();
  }
  try {
    const { usuarioAtual } = await import("./auth");
    const u = await usuarioAtual();
    if (u?.tenantId) {
      return u.tenantId;
    }
  } catch {
    // Chamado fora de contexto de request HTTP (ex.: script de teste/seed)
    const t = await garantirTenantInicial();
    return t.id;
  }
  const t = await garantirTenantInicial();
  return t.id;
}

export const getTenantIdOrThrow = resolverTenantId;

