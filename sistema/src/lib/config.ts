import os from "node:os";
import path from "node:path";
import { domainToASCII, domainToUnicode } from "node:url";

export type DomainRoutingMode = "direct-ip" | "cname";
export type DomainTlsProvider = "caddy" | "frontdoor" | "manual";

export type AppRuntimeConfig = {
  /** Host canônico do painel (pode conter porta em dev, ex.: "172.212.145.134" ou "localhost:3100"). */
  appPanelHost: string;
  /** Hostname do painel sem porta (ex.: "172.212.145.134" ou "localhost"). */
  appPanelCleanHost: string;
  /** URL base canônica do painel sem barra final (ex.: "http://172.212.145.134"). */
  appBaseUrl: string;
  /** Modo de roteamento de domínios de clientes ("direct-ip" para VM com IP estático ou "cname"). */
  domainRoutingMode: DomainRoutingMode;
  /** IPv4 público estático de destino para domínios de clientes no modo "direct-ip". */
  domainTargetIpv4: string | null;
  /** Provedor responsável pela emissão TLS dos domínios customizados ("caddy" | "frontdoor" | "manual"). */
  domainTlsProvider: DomainTlsProvider;
  /** Define se o subdomínio fallback (*.lp.stage.consult) está habilitado para publicação/roteamento. */
  lpFallbackEnabled: boolean;
  /** Domínio-base configurável para fallback quando LP_FALLBACK_ENABLED=true (null quando desativado). */
  lpFallbackBaseDomain: string | null;
  /** Define se o servidor aceita X-Forwarded-Host / X-Forwarded-Proto de um reverse proxy local confiável. */
  trustedProxy: boolean;
  /** Alvo CNAME opcional quando utilizado em conjunto com apontamento DNS. */
  cnameTarget: string | null;
};

export type ExtractedRequestHost = {
  rawHost: string;
  cleanHost: string;
  isValid: boolean;
  usedForwardedHost: boolean;
};

const INTERNAL_CONTEXT_HEADERS = [
  "x-tenant-id",
  "x-pathname",
  "x-locale",
  "x-user-id",
  "x-user-role",
  "x-is-super-admin",
  "x-azure-fdid",
] as const;

const FORWARDED_HEADERS = [
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-forwarded-for",
  "x-real-ip",
] as const;

/**
 * Lê variável de ambiente em runtime evitando inlining estático de build do bundler.
 */
export function readRuntimeEnv(
  key: string,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const raw = env[key];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isValidIpv4(value: string): boolean {
  const trimmed = value.trim();
  const match =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.exec(
      trimmed
    );
  return Boolean(match);
}

export function isLoopbackHost(cleanHost: string): boolean {
  return cleanHost === "localhost" || cleanHost === "127.0.0.1";
}

/**
 * Valida e normaliza um valor de Host HTTP (`hostname[:port]`), normalizando maiúsculas,
 * ponto final DNS (FQDN) e IDN (Punycode ASCII), e rejeitando múltiplos hosts,
 * portas inválidas, caminhos, espaços, labels inválidos ou octetos IPv4 fora de faixa.
 */
export function parseAndValidateHost(rawInput: string): {
  rawHost: string;
  cleanHost: string;
  port: string | null;
  isValid: boolean;
} {
  const lower = rawInput.trim().toLowerCase();
  if (
    !lower ||
    lower.includes(",") ||
    lower.includes("/") ||
    lower.includes("\\") ||
    lower.includes("@") ||
    lower.includes("?") ||
    lower.includes("#") ||
    lower.includes("*") ||
    /[\s\u0000-\u001f\u007f\u3002\uff0e\uff61]/.test(lower)
  ) {
    return { rawHost: lower, cleanHost: "", port: null, isValid: false };
  }

  let hostPart = lower;
  let port: string | null = null;

  const colonIdx = lower.indexOf(":");
  if (colonIdx !== -1) {
    // Não aceita múltiplos ':' (como IPv6 não-colcheado ou formato malformado)
    if (lower.indexOf(":", colonIdx + 1) !== -1) {
      return { rawHost: lower, cleanHost: "", port: null, isValid: false };
    }
    hostPart = lower.slice(0, colonIdx);
    port = lower.slice(colonIdx + 1);
    if (!/^\d{1,5}$/.test(port)) {
      return { rawHost: lower, cleanHost: hostPart, port: null, isValid: false };
    }
    const portNum = Number(port);
    if (portNum < 1 || portNum > 65535) {
      return { rawHost: lower, cleanHost: hostPart, port: null, isValid: false };
    }
  }

  if (
    !hostPart ||
    hostPart.startsWith(".") ||
    hostPart.includes("..")
  ) {
    return { rawHost: lower, cleanHost: hostPart, port, isValid: false };
  }

  // Normaliza ponto final único de FQDN DNS (ex.: "lp.exemplo.com.br." -> "lp.exemplo.com.br")
  if (hostPart.endsWith(".")) {
    hostPart = hostPart.slice(0, -1);
  }

  if (!hostPart) {
    return { rawHost: lower, cleanHost: "", port, isValid: false };
  }

  // Verifica labels brutos antes da conversão IDN para impedir caracteres proibidos em nomes DNS
  const rawLabels = hostPart.split(".");
  for (const rl of rawLabels) {
    if (
      !rl ||
      rl.startsWith("-") ||
      rl.endsWith("-") ||
      /[_!$&'()*+,;=~"<>^`{|}\[\]]/.test(rl)
    ) {
      return { rawHost: lower, cleanHost: hostPart, port, isValid: false };
    }
  }

  const asciiHost = domainToASCII(hostPart);
  if (!asciiHost || asciiHost.length > 253) {
    return { rawHost: lower, cleanHost: asciiHost || hostPart, port, isValid: false };
  }

  const labels = asciiHost.split(".");
  for (const label of labels) {
    if (
      label.length < 1 ||
      label.length > 63 ||
      !/^[a-z0-9-]+$/.test(label) ||
      label.startsWith("-") ||
      label.endsWith("-")
    ) {
      return { rawHost: lower, cleanHost: asciiHost, port, isValid: false };
    }
    if (label.startsWith("xn--")) {
      if (label.length <= 4) {
        return { rawHost: lower, cleanHost: asciiHost, port, isValid: false };
      }
      const unicodeLabel = domainToUnicode(label);
      if (!unicodeLabel || unicodeLabel === label || unicodeLabel.includes("\ufffd")) {
        return { rawHost: lower, cleanHost: asciiHost, port, isValid: false };
      }
    } else if (label.length >= 4 && label.slice(2, 4) === "--") {
      // Prefixo ACE inválido (diferente de xn--)
      return { rawHost: lower, cleanHost: asciiHost, port, isValid: false };
    }
  }

  // Se todos os rótulos são numéricos, precisa ser um IPv4 válido de 4 octetos (0..255)
  if (/^\d+(\.\d+)*$/.test(asciiHost) && !isValidIpv4(asciiHost)) {
    return { rawHost: lower, cleanHost: asciiHost, port, isValid: false };
  }

  const canonicalRawHost = port ? `${asciiHost}:${port}` : asciiHost;
  return { rawHost: canonicalRawHost, cleanHost: asciiHost, port, isValid: true };
}

function parseBooleanEnv(
  raw: string | undefined,
  varName: string,
  defaultValue: boolean
): boolean {
  if (raw === undefined) return defaultValue;
  const normalized = raw.toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  throw new Error(
    `Configuração inválida para ${varName}="${raw}". Use "true", "false", "1" ou "0".`
  );
}

/**
 * Carrega e valida em runtime a configuração server-side de roteamento do painel e domínios.
 * Evita duas fontes conflitantes e preserva compatibilidade com variáveis legadas quando as novas não estão definidas.
 */
export function getAppRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): AppRuntimeConfig {
  const explicitPanelHost = readRuntimeEnv("APP_PANEL_HOST", env);
  const explicitBaseUrl = readRuntimeEnv("APP_BASE_URL", env);

  const legacyHubHost = readRuntimeEnv("HUB_HOST", env);
  const legacyPublicDomain = readRuntimeEnv("NEXT_PUBLIC_APP_DOMAIN", env);
  const legacyPublicUrl = readRuntimeEnv("NEXT_PUBLIC_APP_URL", env);

  // 1. Resolve e valida APP_BASE_URL (se fornecida explicitamente ou via legado quando APP_PANEL_HOST ausente)
  const rawBaseUrlCandidate =
    explicitBaseUrl ?? (!explicitPanelHost ? legacyPublicUrl : undefined);

  let parsedBaseUrl: URL | null = null;
  if (rawBaseUrlCandidate) {
    try {
      parsedBaseUrl = new URL(rawBaseUrlCandidate);
    } catch {
      throw new Error(
        `Configuração inválida: APP_BASE_URL="${rawBaseUrlCandidate}" não é uma URL válida.`
      );
    }
    if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") {
      throw new Error(
        `Configuração inválida: APP_BASE_URL="${rawBaseUrlCandidate}" deve usar protocolo http:// ou https://.`
      );
    }
    const baseHostCheck = parseAndValidateHost(parsedBaseUrl.host);
    if (!baseHostCheck.isValid) {
      throw new Error(
        `Configuração inválida: host "${parsedBaseUrl.host}" em APP_BASE_URL é inválido.`
      );
    }
  }

  // 2. Resolve e valida APP_PANEL_HOST
  const rawPanelHostCandidate =
    explicitPanelHost ??
    (parsedBaseUrl ? parsedBaseUrl.host : undefined) ??
    legacyHubHost ??
    legacyPublicDomain ??
    "localhost:3100";

  // Permite que legados que tenham passado URL completa em HUB_HOST/NEXT_PUBLIC_APP_DOMAIN sejam extraídos se não for APP_PANEL_HOST explícito
  let normalizedPanelHostInput = rawPanelHostCandidate.trim();
  if (!explicitPanelHost && /^https?:\/\//i.test(normalizedPanelHostInput)) {
    try {
      normalizedPanelHostInput = new URL(normalizedPanelHostInput).host;
    } catch {
      // deixa falhar na validação abaixo
    }
  }

  const panelHostParsed = parseAndValidateHost(normalizedPanelHostInput);
  if (!panelHostParsed.isValid) {
    throw new Error(
      `Configuração inválida: APP_PANEL_HOST="${rawPanelHostCandidate}" não é um host ou IPv4 válido.`
    );
  }

  // 3. Impede conflito entre APP_PANEL_HOST e APP_BASE_URL quando ambos são definidos explicitamente
  if (explicitPanelHost && parsedBaseUrl) {
    const baseHostParsed = parseAndValidateHost(parsedBaseUrl.host);
    if (
      baseHostParsed.cleanHost !== panelHostParsed.cleanHost ||
      (panelHostParsed.port &&
        baseHostParsed.port &&
        panelHostParsed.port !== baseHostParsed.port)
    ) {
      throw new Error(
        `Configuração conflitante: APP_PANEL_HOST="${explicitPanelHost}" difere do host definido em APP_BASE_URL="${explicitBaseUrl}".`
      );
    }
  }

  // 4. Constrói appBaseUrl canônica sem barra final
  let appBaseUrl: string;
  if (parsedBaseUrl) {
    const cleanPath = parsedBaseUrl.pathname.replace(/\/+$/, "");
    appBaseUrl = `${parsedBaseUrl.origin}${cleanPath}`;
  } else {
    const defaultScheme =
      isValidIpv4(panelHostParsed.cleanHost) || isLoopbackHost(panelHostParsed.cleanHost)
        ? "http"
        : "https";
    appBaseUrl = `${defaultScheme}://${panelHostParsed.rawHost}`;
  }

  // 5. Resolve e valida DOMAIN_ROUTING_MODE ("direct-ip" | "cname")
  const rawRoutingMode = readRuntimeEnv("DOMAIN_ROUTING_MODE", env)?.toLowerCase();
  let domainRoutingMode: DomainRoutingMode;
  if (!rawRoutingMode) {
    domainRoutingMode = "direct-ip";
  } else if (rawRoutingMode === "direct-ip") {
    domainRoutingMode = "direct-ip";
  } else if (rawRoutingMode === "cname" || rawRoutingMode === "cname-edge") {
    domainRoutingMode = "cname";
  } else {
    throw new Error(
      `Configuração inválida: DOMAIN_ROUTING_MODE="${rawRoutingMode}". Valores suportados: "direct-ip" ou "cname".`
    );
  }

  // 6. Resolve e valida DOMAIN_TARGET_IPV4
  const explicitTargetIpv4 = readRuntimeEnv("DOMAIN_TARGET_IPV4", env);
  let domainTargetIpv4: string | null = null;
  if (explicitTargetIpv4) {
    if (!isValidIpv4(explicitTargetIpv4)) {
      throw new Error(
        `Configuração inválida: DOMAIN_TARGET_IPV4="${explicitTargetIpv4}" não é um endereço IPv4 válido.`
      );
    }
    domainTargetIpv4 = explicitTargetIpv4;
  } else if (isValidIpv4(panelHostParsed.cleanHost)) {
    domainTargetIpv4 = panelHostParsed.cleanHost;
  }

  // 7. Resolve e valida DOMAIN_TLS_PROVIDER ("caddy" | "frontdoor" | "manual")
  const rawTlsProvider = readRuntimeEnv("DOMAIN_TLS_PROVIDER", env)?.toLowerCase();
  let domainTlsProvider: DomainTlsProvider;
  if (!rawTlsProvider || rawTlsProvider === "caddy") {
    domainTlsProvider = "caddy";
  } else if (rawTlsProvider === "frontdoor" || rawTlsProvider === "azure-frontdoor") {
    domainTlsProvider = "frontdoor";
  } else if (rawTlsProvider === "manual") {
    domainTlsProvider = "manual";
  } else {
    throw new Error(
      `Configuração inválida: DOMAIN_TLS_PROVIDER="${rawTlsProvider}". Valores suportados: "caddy", "frontdoor" ou "manual".`
    );
  }

  // 8. Resolve e valida LP_FALLBACK_ENABLED, LP_FALLBACK_BASE_DOMAIN e TRUSTED_PROXY
  const lpFallbackEnabled = parseBooleanEnv(
    readRuntimeEnv("LP_FALLBACK_ENABLED", env),
    "LP_FALLBACK_ENABLED",
    false
  );

  const rawFallbackBase = readRuntimeEnv("LP_FALLBACK_BASE_DOMAIN", env)?.replace(/^\.+|\.+$/g, "");
  let lpFallbackBaseDomain: string | null = null;
  if (rawFallbackBase) {
    if (isValidIpv4(rawFallbackBase) || /^\d+(\.\d+)*$/.test(rawFallbackBase)) {
      throw new Error(
        `Configuração inválida: LP_FALLBACK_BASE_DOMAIN="${rawFallbackBase}" não pode ser um endereço IP.`
      );
    }
    const fbParsed = parseAndValidateHost(rawFallbackBase);
    if (!fbParsed.isValid || fbParsed.port || !fbParsed.cleanHost.includes(".")) {
      throw new Error(
        `Configuração inválida: LP_FALLBACK_BASE_DOMAIN="${rawFallbackBase}" deve ser um domínio DNS válido.`
      );
    }
    lpFallbackBaseDomain = lpFallbackEnabled ? fbParsed.cleanHost : null;
  } else if (lpFallbackEnabled) {
    lpFallbackBaseDomain = "lp.stage.consult";
  }

  const trustedProxy = parseBooleanEnv(
    readRuntimeEnv("TRUSTED_PROXY", env),
    "TRUSTED_PROXY",
    false
  );

  const rawCnameTarget = readRuntimeEnv("CNAME_TARGET", env);
  let cnameTarget: string | null = null;
  if (rawCnameTarget) {
    const cleanedCname = rawCnameTarget.replace(/\.$/, "");
    if (isValidIpv4(cleanedCname) || /^\d+(\.\d+)*$/.test(cleanedCname)) {
      throw new Error(
        `Configuração inválida: CNAME_TARGET="${rawCnameTarget}" não pode ser um endereço IP. Para apontamento por IP, use DOMAIN_ROUTING_MODE="direct-ip" e DOMAIN_TARGET_IPV4.`
      );
    }
    const cnameParsed = parseAndValidateHost(cleanedCname);
    if (!cnameParsed.isValid || cnameParsed.port || !cnameParsed.cleanHost.includes(".")) {
      throw new Error(
        `Configuração inválida: CNAME_TARGET="${rawCnameTarget}" deve ser um hostname DNS válido.`
      );
    }
    cnameTarget = cnameParsed.cleanHost;
  }

  return {
    appPanelHost: panelHostParsed.rawHost,
    appPanelCleanHost: panelHostParsed.cleanHost,
    appBaseUrl,
    domainRoutingMode,
    domainTargetIpv4,
    domainTlsProvider,
    lpFallbackEnabled,
    lpFallbackBaseDomain,
    trustedProxy,
    cnameTarget,
  };
}

/**
 * Resolve o domínio de fallback operacional de um tenant SOMENTE quando `LP_FALLBACK_ENABLED=true`
 * e o `tenantSlug` real é válido. Nunca retorna valores fixos fictícios (como "cliente.lp.stage.consult")
 * e retorna sempre `null` quando `LP_FALLBACK_ENABLED=false`.
 */
export function resolveTenantFallbackDomain(
  tenantSlug: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const cfg = getAppRuntimeConfig(env);
  if (!cfg.lpFallbackEnabled || !cfg.lpFallbackBaseDomain) {
    return null;
  }
  const cleanSlug = typeof tenantSlug === "string" ? tenantSlug.trim().toLowerCase() : "";
  if (!cleanSlug || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(cleanSlug)) {
    return null;
  }
  return `${cleanSlug}.${cfg.lpFallbackBaseDomain}`;
}

/**
 * Verifica se uma URL ou hostname aponta para o domínio de fallback (`.lp.stage.consult` ou
 * `LP_FALLBACK_BASE_DOMAIN`).
 */
export function isFallbackDomainReference(
  urlOrHost: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (typeof urlOrHost !== "string" || !urlOrHost.trim()) return false;
  const trimmed = urlOrHost.trim().toLowerCase();
  let host = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      host = new URL(trimmed).hostname.toLowerCase();
    } catch {
      return false;
    }
  }
  const configuredBase =
    readRuntimeEnv("LP_FALLBACK_BASE_DOMAIN", env)
      ?.replace(/^\.+|\.+$/g, "")
      .toLowerCase() || "lp.stage.consult";
  return (
    host === "lp.stage.consult" ||
    host.endsWith(".lp.stage.consult") ||
    host === configuredBase ||
    host.endsWith(`.${configuredBase}`)
  );
}

export function isTrustedProxyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return getAppRuntimeConfig(env).trustedProxy;
}

export function getAppBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return getAppRuntimeConfig(env).appBaseUrl;
}

/**
 * Leitura centralizada e segura do Host da requisição:
 * - Aceita `X-Forwarded-Host` SOMENTE quando `TRUSTED_PROXY` está explicitamente habilitado na configuração.
 * - NUNCA confia em `x-azure-fdid` ou outros cabeçalhos externos para habilitar leitura de `X-Forwarded-Host`.
 * - Se `X-Forwarded-Host` for usado (em modo proxy confiável) e contiver múltiplos valores separados por vírgula,
 *   utiliza o primeiro valor e o valida estritamente.
 */
export function extractRequestHost(
  input:
    | Request
    | Headers
    | { headers: Headers; nextUrl?: { host?: string } | null; url?: string },
  env: NodeJS.ProcessEnv = process.env
): ExtractedRequestHost {
  const headers = input instanceof Headers ? input : input.headers;
  const nextUrlHost =
    !(input instanceof Headers) &&
    "nextUrl" in input &&
    input.nextUrl &&
    typeof input.nextUrl.host === "string"
      ? input.nextUrl.host
      : "";
  let requestUrlHost = "";
  if (
    !nextUrlHost &&
    !(input instanceof Headers) &&
    "url" in input &&
    typeof input.url === "string" &&
    input.url.trim().length > 0
  ) {
    try {
      requestUrlHost = new URL(input.url).host;
    } catch {
      requestUrlHost = "";
    }
  }

  const { trustedProxy } = getAppRuntimeConfig(env);

  const rawForwardedHost = trustedProxy ? headers.get("x-forwarded-host") : null;
  const hasForwardedHost =
    typeof rawForwardedHost === "string" && rawForwardedHost.trim().length > 0;

  let candidate = "";
  let usedForwardedHost = false;

  if (hasForwardedHost) {
    candidate = rawForwardedHost!.split(",")[0]?.trim() ?? "";
    usedForwardedHost = true;
  } else {
    const directHostHeader = headers.get("host");
    if (typeof directHostHeader === "string" && directHostHeader.trim().length > 0) {
      candidate = directHostHeader.trim();
    } else {
      candidate = (nextUrlHost || requestUrlHost).trim();
    }
  }

  const parsed = parseAndValidateHost(candidate);
  return {
    rawHost: parsed.rawHost,
    cleanHost: parsed.cleanHost,
    isValid: parsed.isValid,
    usedForwardedHost,
  };
}

/**
 * Verifica se o host extraído corresponde ao host do Painel SaaS (incluindo o IP configurado da VM
 * ou loopback local `localhost` / `127.0.0.1`).
 */
export function isAppPanelHost(
  rawHost: string,
  cleanHost?: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const parsed = cleanHost
    ? { rawHost: rawHost.trim().toLowerCase(), cleanHost: cleanHost.trim().toLowerCase() }
    : parseAndValidateHost(rawHost);

  if (!parsed.cleanHost) return false;

  const cfg = getAppRuntimeConfig(env);
  if (
    parsed.rawHost === cfg.appPanelHost ||
    parsed.cleanHost === cfg.appPanelCleanHost
  ) {
    return true;
  }

  if (isLoopbackHost(parsed.cleanHost)) {
    return true;
  }

  return false;
}

/**
 * Verifica se o Host da requisição é elegível para a chamada interna `ask` do Caddy
 * (`/api/internal/caddy/allow`): aceita loopback (`127.0.0.1`, `localhost`), o serviço interno
 * Docker (`web`) ou o host interno do painel, recusando estritamente domínios de clientes.
 */
export function isInternalCaddyRequestHost(
  rawHost: string,
  cleanHost?: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const parsed = cleanHost
    ? { rawHost: rawHost.trim().toLowerCase(), cleanHost: cleanHost.trim().toLowerCase() }
    : parseAndValidateHost(rawHost);

  if (!parsed.cleanHost) return false;
  if (isLoopbackHost(parsed.cleanHost) || parsed.cleanHost === "web") {
    return true;
  }
  return isAppPanelHost(parsed.rawHost, parsed.cleanHost, env);
}

export type CaddyTlsProbeTarget = {
  host: string;
  port: number;
};

/**
 * Resolve e valida estritamente o destino TCP de conexão para sondagem/reconciliação TLS
 * junto ao Caddy, usando exclusivamente a configuração server-side (`CADDY_TLS_PROBE_HOST`
 * e `CADDY_TLS_PROBE_PORT`).
 *
 * Destinos permitidos:
 * - `"caddy"` (serviço interno na rede Docker Compose)
 * - `"127.0.0.1"` / `"localhost"` (loopback local no modo systemd)
 * - `domainTargetIpv4` ou `appPanelCleanHost` configurados no servidor (ex.: `172.212.145.134`)
 *
 * Qualquer host arbitrário, URL com protocolo/caminho ou porta inválida é recusado.
 */
export function resolveCaddyTlsProbeTarget(
  env: NodeJS.ProcessEnv = process.env
): CaddyTlsProbeTarget {
  const cfg = getAppRuntimeConfig(env);
  const rawHost = readRuntimeEnv("CADDY_TLS_PROBE_HOST", env) ?? "127.0.0.1";
  const rawPort = readRuntimeEnv("CADDY_TLS_PROBE_PORT", env) ?? "443";

  if (
    rawHost.includes("://") ||
    rawHost.includes("/") ||
    rawHost.includes("?") ||
    rawHost.includes("#") ||
    rawHost.includes("@") ||
    rawHost.includes(":")
  ) {
    throw new Error(
      `Configuração inválida: CADDY_TLS_PROBE_HOST="${rawHost}" deve ser apenas um hostname ou IPv4 aprovado (sem protocolo, porta ou caminho).`
    );
  }

  const parsedHost = parseAndValidateHost(rawHost);
  if (!parsedHost.isValid || parsedHost.port) {
    throw new Error(
      `Configuração inválida: CADDY_TLS_PROBE_HOST="${rawHost}" não é um host válido.`
    );
  }

  const approvedHosts = new Set<string>(["caddy", "127.0.0.1", "localhost"]);
  if (cfg.domainTargetIpv4) {
    approvedHosts.add(cfg.domainTargetIpv4.toLowerCase());
  }
  if (cfg.appPanelCleanHost) {
    approvedHosts.add(cfg.appPanelCleanHost.toLowerCase());
  }

  if (!approvedHosts.has(parsedHost.cleanHost)) {
    throw new Error(
      `Configuração inválida: CADDY_TLS_PROBE_HOST="${rawHost}" não pertence à lista de destinos aprovados pelo servidor (${Array.from(approvedHosts).join(", ")}).`
    );
  }

  if (!/^\d{1,5}$/.test(rawPort)) {
    throw new Error(
      `Configuração inválida: CADDY_TLS_PROBE_PORT="${rawPort}" deve ser uma porta TCP numérica (1..65535).`
    );
  }
  const portNum = Number(rawPort);
  if (portNum < 1 || portNum > 65535) {
    throw new Error(
      `Configuração inválida: CADDY_TLS_PROBE_PORT="${rawPort}" fora da faixa permitida (1..65535).`
    );
  }

  return {
    host: parsedHost.cleanHost,
    port: portNum,
  };
}

/**
 * Remove cabeçalhos internos de contexto que jamais devem ser aceitos de clientes externos
 * e, quando fora do modo de proxy confiável, remove também cabeçalhos `x-forwarded-*`.
 */
export function sanitizeInternalRequestHeaders(
  incomingHeaders: Headers,
  env: NodeJS.ProcessEnv = process.env
): Headers {
  const sanitized = new Headers(incomingHeaders);
  for (const h of INTERNAL_CONTEXT_HEADERS) {
    sanitized.delete(h);
  }

  const { trustedProxy } = getAppRuntimeConfig(env);
  if (!trustedProxy) {
    for (const fh of FORWARDED_HEADERS) {
      sanitized.delete(fh);
    }
  }

  return sanitized;
}

/**
 * Constrói uma URL absoluta server-side pertencente ao Painel SaaS de forma segura,
 * sem confiar em `request.url` contaminado por `X-Forwarded-Host` não confiável.
 */
export function buildAppPanelUrl(
  pathnameAndSearch: string,
  options?: {
    requestHost?: string;
    env?: NodeJS.ProcessEnv;
  }
): URL {
  const env = options?.env ?? process.env;
  const cfg = getAppRuntimeConfig(env);
  const pathPart = pathnameAndSearch.startsWith("/")
    ? pathnameAndSearch
    : `/${pathnameAndSearch}`;

  // Se o acesso atual é via loopback local (localhost/127.0.0.1) e nenhum APP_BASE_URL explícito foi forçado,
  // preserva o host:porta de loopback usado no navegador de desenvolvimento.
  if (options?.requestHost && !readRuntimeEnv("APP_BASE_URL", env)) {
    const reqParsed = parseAndValidateHost(options.requestHost);
    if (reqParsed.isValid && isLoopbackHost(reqParsed.cleanHost)) {
      return new URL(pathPart, `http://${reqParsed.rawHost}`);
    }
  }

  return new URL(pathPart, `${cfg.appBaseUrl}/`);
}

/** Diretório temporário isolado (nenhuma leitura de ../cerebro em runtime). */
export function workspaceDir(): string {
  const dir = readRuntimeEnv("WORKSPACE_DIR");
  if (dir) return path.resolve(dir);
  return path.join(os.tmpdir(), "stage-hub-workspace");
}

export function sessionSecret(): Uint8Array {
  const secret = readRuntimeEnv("JWT_SECRET") || readRuntimeEnv("HUB_SECRET");
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET (ou HUB_SECRET) precisa ter 32+ caracteres em produção");
    }
    return new TextEncoder().encode("dev-only-stage-hub-jwt-secret-key-minimum-32-chars!!");
  }
  return new TextEncoder().encode(secret);
}
