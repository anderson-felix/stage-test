import { DnsStatus, SslStatus } from "@prisma/client";
import { parseAndValidateHost, isValidIpv4, isAppPanelHost, isFallbackDomainReference } from "./config";

export type PublishErrorCategory = "auth" | "validation" | "dns" | "tls" | "storage";

export function validateDomainStateForPublish(
  domain: {
    id: string;
    tenantId: string;
    domain: string;
    dnsStatus: DnsStatus | string;
    sslStatus: SslStatus | string;
  },
  expectedTenantId: string
):
  | { ok: true; canonicalDomain: string }
  | {
      ok: false;
      status: number;
      category: PublishErrorCategory;
      code: string;
      error: string;
    } {
  if (domain.tenantId !== expectedTenantId) {
    return {
      ok: false,
      status: 403,
      category: "auth",
      code: "DOMAIN_TENANT_MISMATCH",
      error: "Domínio customizado inválido ou não pertence a esta empresa.",
    };
  }

  let canonicalDomain: string;
  try {
    const parsed = parseAndValidateHost(domain.domain);
    if (!parsed.isValid || parsed.port || !parsed.cleanHost.includes(".") || isValidIpv4(parsed.cleanHost)) throw new Error("Invalid domain");
    canonicalDomain = parsed.cleanHost;
  } catch {
    return {
      ok: false,
      status: 400,
      category: "dns",
      code: "INVALID_DOMAIN_HOSTNAME",
      error: `O hostname "${domain.domain}" não é um domínio próprio válido para publicação.`,
    };
  }

  if (
    isAppPanelHost(canonicalDomain, canonicalDomain) ||
    isFallbackDomainReference(canonicalDomain)
  ) {
    return {
      ok: false,
      status: 400,
      category: "dns",
      code: "RESERVED_DOMAIN_FORBIDDEN",
      error:
        "O endereço do painel ou o subdomínio .lp.stage.consult não pode ser utilizado como domínio próprio de publicação.",
    };
  }

  if (domain.dnsStatus !== DnsStatus.VERIFIED) {
    return {
      ok: false,
      status: 400,
      category: "dns",
      code: "DNS_NOT_VERIFIED",
      error: `O domínio "${canonicalDomain}" ainda não está com o DNS verificado (dnsStatus: ${domain.dnsStatus}). Configure os registros A e TXT e conclua a verificação DNS antes de publicar a Landing Page.`,
    };
  }

  if (domain.sslStatus !== SslStatus.ACTIVE) {
    return {
      ok: false,
      status: 400,
      category: "tls",
      code: "SSL_NOT_ACTIVE",
      error: `O certificado HTTPS (TLS) do domínio "${canonicalDomain}" ainda não está ativo (sslStatus: ${domain.sslStatus}). Aguarde a emissão e validação do certificado TLS pelo Caddy antes de publicar a Landing Page.`,
    };
  }

  return { ok: true, canonicalDomain };
}

