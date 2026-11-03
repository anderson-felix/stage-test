import Redis from "ioredis";
import { DnsStatus } from "@prisma/client";
import prisma from "./prisma";

export const DOMAIN_CACHE_TTL = 3600; // 3600 segundos (1 hora)

export type DomainMapping = {
  tenantId: string;
  tenantSlug: string;
  customDomainId: string | null;
  isFallback: boolean;
};

type MemoryEntry<T> = {
  value: T;
  expiresAt: number;
};

const globalForRedis = globalThis as unknown as {
  redisClient?: Redis | null;
  redisUnavailable?: boolean;
  memoryCache?: Map<string, MemoryEntry<unknown>>;
};

const memoryCache =
  globalForRedis.memoryCache ?? (globalForRedis.memoryCache = new Map());

export function getRedisClient(): Redis | null {
  if (globalForRedis.redisUnavailable) return null;
  if (globalForRedis.redisClient !== undefined) return globalForRedis.redisClient;

  const url = process.env.REDIS_URL;
  if (!url) {
    globalForRedis.redisClient = null;
    return null;
  }

  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2500,
      lazyConnect: true,
    });

    client.on("error", () => {
      if (process.env.NODE_ENV !== "production") {
        globalForRedis.redisUnavailable = true;
      }
    });

    globalForRedis.redisClient = client;
    return client;
  } catch {
    globalForRedis.redisClient = null;
    return null;
  }
}

export function normalizeHostname(rawHost: string): string {
  const trimmed = rawHost.trim().toLowerCase();
  const withoutPort = trimmed.replace(/:\d+$/, "");
  if (!withoutPort || !/^[a-z0-9.-]+$/.test(withoutPort) || withoutPort.includes("..")) {
    return "";
  }
  return withoutPort;
}

function getMemory<T>(key: string): T | undefined {
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function setMemory<T>(key: string, value: T, ttlSeconds: number): void {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Resolve o mapeamento Host -> Tenant com cache Redis de 3600s e fallback PostgreSQL.
 * Aceita tanto CustomDomain com dnsStatus == VERIFIED quanto o subdomínio fallback
 * `{tenant-slug}.lp.stage.consult` (e `{tenant-slug}.localhost` em dev).
 */
export async function getDomainMapping(rawHost: string): Promise<DomainMapping | null> {
  const host = normalizeHostname(rawHost);
  if (!host) return null;

  const cacheKey = `domain_map:${host}`;

  // 1. Tenta Redis
  const redis = getRedisClient();
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        if (cached === "__NULL__") return null;
        return JSON.parse(cached) as DomainMapping;
      }
    } catch {
      // Redis indisponível: segue para memória / banco
    }
  }

  // 2. Fallback em memória (desenvolvimento)
  const memCached = getMemory<DomainMapping | "__NULL__">(cacheKey);
  if (memCached !== undefined) {
    return memCached === "__NULL__" ? null : memCached;
  }

  // 3. Consulta PostgreSQL
  let mapping: DomainMapping | null = null;

  const fallbackSuffix = ".lp.stage.consult";
  const devLocalSuffix = ".localhost";

  if (host.endsWith(fallbackSuffix)) {
    const slug = host.slice(0, -fallbackSuffix.length);
    if (slug && /^[a-z0-9-]+$/.test(slug)) {
      const tenant = await prisma.tenant.findUnique({
        where: { slug },
        select: { id: true, slug: true, isActive: true },
      });
      if (tenant && tenant.isActive) {
        mapping = {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          customDomainId: null,
          isFallback: true,
        };
      }
    }
  } else if (process.env.NODE_ENV !== "production" && host.endsWith(devLocalSuffix)) {
    const slug = host.slice(0, -devLocalSuffix.length);
    if (slug && /^[a-z0-9-]+$/.test(slug)) {
      const tenant = await prisma.tenant.findUnique({
        where: { slug },
        select: { id: true, slug: true, isActive: true },
      });
      if (tenant && tenant.isActive) {
        mapping = {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          customDomainId: null,
          isFallback: true,
        };
      }
    }
  } else {
    const customDomain = await prisma.customDomain.findUnique({
      where: { domain: host },
      include: {
        tenant: {
          select: { id: true, slug: true, isActive: true },
        },
      },
    });
    if (
      customDomain &&
      customDomain.dnsStatus === DnsStatus.VERIFIED &&
      customDomain.tenant.isActive
    ) {
      mapping = {
        tenantId: customDomain.tenant.id,
        tenantSlug: customDomain.tenant.slug,
        customDomainId: customDomain.id,
        isFallback: false,
      };
    }
  }

  // 4. Salva no Redis / memória com TTL de 3600s
  const toCache = mapping ?? "__NULL__";
  const ttl = mapping ? DOMAIN_CACHE_TTL : 120;
  setMemory(cacheKey, toCache, ttl);

  if (redis) {
    try {
      await redis.set(
        cacheKey,
        mapping ? JSON.stringify(mapping) : "__NULL__",
        "EX",
        ttl
      );
    } catch {
      // ignora falha de escrita no Redis
    }
  }

  return mapping;
}

/** Limpa o cache de mapeamento de um domínio quando o CustomDomain ou LP mudar. */
export async function invalidateDomainMapping(rawHost: string): Promise<void> {
  const host = normalizeHostname(rawHost);
  if (!host) return;
  const cacheKey = `domain_map:${host}`;
  memoryCache.delete(cacheKey);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(cacheKey);
    } catch {
      // ignora
    }
  }
}

/** Rate limiter distribuído via Redis com fallback em memória para proteção de rotas públicas. */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const rateKey = `ratelimit:${key}`;
  const redis = getRedisClient();

  if (redis) {
    try {
      const current = await redis.incr(rateKey);
      if (current === 1) {
        await redis.expire(rateKey, windowSeconds);
      }
      return {
        allowed: current <= maxRequests,
        remaining: Math.max(0, maxRequests - current),
      };
    } catch {
      // fallback memória
    }
  }

  const now = Date.now();
  const entry = memoryCache.get(rateKey) as { value: number; expiresAt: number } | undefined;
  if (!entry || now > entry.expiresAt) {
    memoryCache.set(rateKey, { value: 1, expiresAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  entry.value += 1;
  return {
    allowed: entry.value <= maxRequests,
    remaining: Math.max(0, maxRequests - entry.value),
  };
}

