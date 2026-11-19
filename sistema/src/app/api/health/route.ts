import { extractRequestHost, isInternalCaddyRequestHost } from "@/lib/config";
import { prisma } from "@/lib/prisma";

export const HEALTH_DB_TIMEOUT_MS = 2500;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

export type HealthSummaryResponse = {
  status: "ok" | "initializing" | "unavailable";
  live: boolean;
  ready: boolean;
  checks: {
    database: "ok" | "initializing" | "unavailable";
  };
};

function isSchemaNotInitializedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = String((err as { code?: string }).code || "")
    .trim()
    .toUpperCase();
  const message = String((err as { message?: string }).message || "");

  // P2021: The table does not exist in the current database
  // P2022: The column does not exist in the current database
  // 42P01: PostgreSQL undefined_table (migrations ainda em execução / banco não inicializado)
  if (code === "P2021" || code === "P2022" || code === "42P01") {
    return true;
  }
  return /does not exist in the current database|relation .* does not exist|migrations? pending/i.test(
    message
  );
}

export async function evaluateSystemHealth(options?: {
  probe?: "liveness" | "readiness";
  timeoutMs?: number;
  checkDatabase?: () => Promise<unknown>;
}): Promise<{ httpStatus: 200 | 503; body: HealthSummaryResponse }> {
  const probe = options?.probe ?? "readiness";

  if (probe === "liveness") {
    return {
      httpStatus: 200,
      body: {
        status: "ok",
        live: true,
        ready: true,
        checks: {
          database: "ok",
        },
      },
    };
  }

  const timeoutMs = options?.timeoutMs ?? HEALTH_DB_TIMEOUT_MS;
  const dbCheckFn =
    options?.checkDatabase ??
    (() =>
      prisma.tenant.findFirst({
        select: { id: true },
      }));

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      dbCheckFn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const timeoutErr = new Error("Healthcheck database timeout") as Error & {
            code?: string;
          };
          timeoutErr.code = "ETIMEOUT";
          reject(timeoutErr);
        }, timeoutMs);
      }),
    ]);

    return {
      httpStatus: 200,
      body: {
        status: "ok",
        live: true,
        ready: true,
        checks: {
          database: "ok",
        },
      },
    };
  } catch (err) {
    if (isSchemaNotInitializedError(err)) {
      return {
        httpStatus: 503,
        body: {
          status: "initializing",
          live: true,
          ready: false,
          checks: {
            database: "initializing",
          },
        },
      };
    }

    return {
      httpStatus: 503,
      body: {
        status: "unavailable",
        live: true,
        ready: false,
        checks: {
          database: "unavailable",
        },
      },
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * GET /api/health
 *
 * Endpoint mínimo de saúde para o healthcheck do container (sem exigir sessão/cookie):
 * - Distingue processo vivo (`?probe=liveness` -> `live: true`) de dependências essenciais prontas
 *   (padrão `readiness` -> verifica banco e schema migrado).
 * - Retorna `503` com `status: "initializing"` enquanto migrations/schema estiverem incompletos
 *   e `503` com `status: "unavailable"` se o banco estiver indisponível.
 * - Retorna apenas estado resumido (`status`, `live`, `ready`, `checks.database`), sem expor
 *   versões, segredos, stack traces ou configuração interna.
 */
export async function GET(request: Request) {
  const hostInfo = extractRequestHost(request);
  if (!hostInfo.isValid || !isInternalCaddyRequestHost(hostInfo.rawHost, hostInfo.cleanHost)) {
    return Response.json(
      { error: "Rota indisponível neste host" },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const url = new URL(request.url);
  const rawProbe = url.searchParams.get("probe")?.trim().toLowerCase();
  const probe = rawProbe === "liveness" || rawProbe === "live" ? "liveness" : "readiness";

  const result = await evaluateSystemHealth({ probe });
  return Response.json(result.body, {
    status: result.httpStatus,
    headers: NO_STORE_HEADERS,
  });
}

export async function HEAD(request: Request) {
  const res = await GET(request);
  return new Response(null, {
    status: res.status,
    headers: res.headers,
  });
}

