import { extractRequestHost, isInternalCaddyRequestHost } from "@/lib/config";
import { checkCaddyOnDemandTlsAllow } from "@/lib/domains";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

/**
 * GET /api/internal/caddy/allow?domain=HOST
 *
 * Endpoint interno de autorização On-Demand TLS (`ask`) para o Caddy.
 * - Responde 200 somente para hostname canônico cadastrado, tenant ativo e DNS verificado
 *   conforme a política de validade.
 * - Não exige sslStatus === ACTIVE nem LP publicada (autoriza emissão do primeiro certificado).
 * - Não consulta DNS, não emite certificado e não altera nenhum estado no banco.
 * - Falha de banco nega autorização (fail-closed -> HTTP 503).
 *
 * Contrato de Proteção de Rede (obrigatório antes do deploy na Tarefa 08):
 * 1. O Caddy deve bloquear `/api/internal/*` nos listeners públicos `:80` e `:443` antes do `reverse_proxy`.
 * 2. A porta do backend Next.js (`3000`/`3100`) deve permanecer restrita a loopback (`127.0.0.1`)
 *    ou à rede interna Docker (`expose: ["3000"]`), nunca exposta publicamente em `0.0.0.0`.
 */
export async function GET(request: Request) {
  try {
    const hostInfo = extractRequestHost(request);
    if (!hostInfo.isValid || !isInternalCaddyRequestHost(hostInfo.rawHost, hostInfo.cleanHost)) {
      return Response.json(
        { allowed: false, domain: null, reason: "forbidden_host" },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const url = new URL(request.url);
    const domain = url.searchParams.get("domain");
    const decision = await checkCaddyOnDemandTlsAllow(domain);

    return Response.json(
      {
        allowed: decision.allowed,
        domain: decision.domain,
        reason: decision.reason,
      },
      {
        status: decision.statusCode,
        headers: NO_STORE_HEADERS,
      }
    );
  } catch {
    return Response.json(
      { allowed: false, domain: null, reason: "database_error" },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}

