import dns from "node:dns/promises";
import { randomBytes } from "node:crypto";
import { DnsStatus, SslStatus } from "@prisma/client";
import prisma from "./prisma";
import { invalidateDomainMapping, normalizeHostname } from "./redis";

export type DnsInstructionRecord = {
  type: "CNAME" | "TXT" | "ALIAS/ANAME";
  host: string;
  value: string;
  ttl: string;
  purpose: string;
};

export type CustomDomainWithInstructions = {
  id: string;
  tenantId: string;
  domain: string;
  isSubdomain: boolean;
  dnsProviderHint: string | null;
  verificationToken: string;
  cnameTarget: string;
  dnsStatus: DnsStatus;
  sslStatus: SslStatus;
  isDefault: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
  records: DnsInstructionRecord[];
  azureFrontDoorNote?: string;
};

const MULTI_PART_TLDS = new Set([
  "com.br",
  "net.br",
  "org.br",
  "gov.br",
  "edu.br",
  "co.uk",
  "org.uk",
  "com.ar",
  "com.mx",
]);

export function detectIsSubdomain(domain: string): {
  isSubdomain: boolean;
  hostLabel: string;
  rootDomain: string;
} {
  const parts = domain.split(".");
  if (parts.length <= 2) {
    return { isSubdomain: false, hostLabel: "@", rootDomain: domain };
  }
  const lastTwo = parts.slice(-2).join(".");
  const baseLabelCount = MULTI_PART_TLDS.has(lastTwo) ? 3 : 2;
  if (parts.length <= baseLabelCount) {
    return { isSubdomain: false, hostLabel: "@", rootDomain: domain };
  }
  const hostLabel = parts.slice(0, parts.length - baseLabelCount).join(".");
  const rootDomain = parts.slice(parts.length - baseLabelCount).join(".");
  return { isSubdomain: true, hostLabel, rootDomain };
}

export function buildDnsInstructions(domainRow: {
  domain: string;
  isSubdomain: boolean;
  cnameTarget: string;
  verificationToken: string;
}): DnsInstructionRecord[] {
  const { isSubdomain, hostLabel } = detectIsSubdomain(domainRow.domain);
  const records: DnsInstructionRecord[] = [];

  if (isSubdomain) {
    records.push({
      type: "CNAME",
      host: hostLabel,
      value: domainRow.cnameTarget,
      ttl: "3600 (ou Automático)",
      purpose: "Aponta o subdomínio de Landing Pages para a borda da Stage.",
    });
  } else {
    records.push({
      type: "ALIAS/ANAME",
      host: "@",
      value: domainRow.cnameTarget,
      ttl: "3600 (ou Automático)",
      purpose:
        "Domínio raiz (apex): use CNAME Flattening (Cloudflare) ou ALIAS/ANAME. Se seu provedor (ex.: Registro.br) não suportar CNAME na raiz, recomendamos usar um subdomínio como lp." +
        domainRow.domain,
    });
  }

  records.push({
    type: "TXT",
    host: isSubdomain ? `_stage-verify.${hostLabel}` : "_stage-verify",
    value: domainRow.verificationToken,
    ttl: "3600 (ou Automático)",
    purpose: "Validação de propriedade do domínio e autorização de certificado SSL.",
  });

  return records;
}

function serializeDomain(row: {
  id: string;
  tenantId: string;
  domain: string;
  isSubdomain: boolean;
  dnsProviderHint: string | null;
  verificationToken: string;
  cnameTarget: string;
  dnsStatus: DnsStatus;
  sslStatus: SslStatus;
  isDefault: boolean;
  lastCheckedAt: Date | null;
  createdAt: Date;
}): CustomDomainWithInstructions {
  return {
    id: row.id,
    tenantId: row.tenantId,
    domain: row.domain,
    isSubdomain: row.isSubdomain,
    dnsProviderHint: row.dnsProviderHint,
    verificationToken: row.verificationToken,
    cnameTarget: row.cnameTarget,
    dnsStatus: row.dnsStatus,
    sslStatus: row.sslStatus,
    isDefault: row.isDefault,
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    records: buildDnsInstructions(row),
  };
}

export async function listTenantDomains(tenantId: string): Promise<{
  fallbackDomain: string;
  customDomains: CustomDomainWithInstructions[];
}> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  });
  const rows = await prisma.customDomain.findMany({
    where: { tenantId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return {
    fallbackDomain: `${tenant?.slug ?? "cliente"}.lp.stage.consult`,
    customDomains: rows.map(serializeDomain),
  };
}

export async function registerCustomDomain(
  tenantId: string,
  params: {
    domain: string;
    dnsProviderHint?: string;
    isDefault?: boolean;
  }
): Promise<CustomDomainWithInstructions> {
  const cleanDomain = normalizeHostname(params.domain);
  if (!cleanDomain || !cleanDomain.includes(".")) {
    throw new Error("Informe um domínio válido (ex.: lp.suaempresa.com.br)");
  }
  if (cleanDomain.endsWith(".stage.consult") || cleanDomain === "localhost") {
    throw new Error("Use um domínio próprio da sua empresa");
  }

  const existing = await prisma.customDomain.findUnique({
    where: { domain: cleanDomain },
  });
  if (existing) {
    if (existing.tenantId === tenantId) {
      throw new Error("Este domínio já está cadastrado na sua conta");
    }
    throw new Error("Este domínio já está vinculado a outra conta");
  }

  const { isSubdomain } = detectIsSubdomain(cleanDomain);
  const verificationToken = `stage-verify-${randomBytes(12).toString("hex")}`;
  const cnameTarget = process.env.CNAME_TARGET || "domains.stage.consult";

  const count = await prisma.customDomain.count({ where: { tenantId } });
  const shouldBeDefault = params.isDefault ?? count === 0;

  const created = await prisma.$transaction(async (tx) => {
    if (shouldBeDefault) {
      await tx.customDomain.updateMany({
        where: { tenantId },
        data: { isDefault: false },
      });
    }
    return tx.customDomain.create({
      data: {
        tenantId,
        domain: cleanDomain,
        isSubdomain,
        dnsProviderHint: params.dnsProviderHint?.trim() || null,
        verificationToken,
        cnameTarget,
        dnsStatus: DnsStatus.PENDING,
        sslStatus: SslStatus.PENDING,
        isDefault: shouldBeDefault,
      },
    });
  });

  return serializeDomain(created);
}

/**
 * Integração real com Azure Front Door (Microsoft.Cdn/profiles/customDomains) via Azure ARM REST API
 * para registro de AFDCustomDomain, emissão de ManagedCertificate e associação à rota de borda.
 */
async function provisionAzureFrontDoorCustomDomain(domainRow: {
  id: string;
  domain: string;
}): Promise<{ sslStatus: SslStatus; diagnosticMessage: string }> {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const resourceGroup = process.env.AZURE_RESOURCE_GROUP;
  const profileName = process.env.AZURE_FRONTDOOR_PROFILE_NAME;
  const endpointName = process.env.AZURE_FRONTDOOR_ENDPOINT_NAME;
  const routeName = process.env.AZURE_FRONTDOOR_ROUTE_NAME;

  if (
    !tenantId ||
    !clientId ||
    !clientSecret ||
    !subscriptionId ||
    !resourceGroup ||
    !profileName
  ) {
    return {
      sslStatus: SslStatus.PENDING,
      diagnosticMessage:
        "DNS verificado com sucesso. Provisionamento automático de certificado gerenciado no Azure Front Door aguarda configuração das credenciais AZURE_* no servidor.",
    };
  }

  try {
    // 1. Obter token OAuth2 do Azure AD para o Azure Resource Manager
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
          scope: "https://management.azure.com/.default",
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!tokenRes.ok) {
      return {
        sslStatus: SslStatus.FAILED,
        diagnosticMessage: `Falha ao autenticar no Azure Resource Manager (HTTP ${tokenRes.status}).`,
      };
    }

    const { access_token } = (await tokenRes.json()) as { access_token: string };
    const afdDomainName = domainRow.domain.replace(/[^a-zA-Z0-9-]/g, "-");
    const baseUrl = `https://management.azure.com/subscriptions/${encodeURIComponent(subscriptionId)}/resourceGroups/${encodeURIComponent(resourceGroup)}/providers/Microsoft.Cdn/profiles/${encodeURIComponent(profileName)}`;

    // 2. Criar ou atualizar AFDCustomDomain com ManagedCertificate
    const putDomainUrl = `${baseUrl}/customDomains/${encodeURIComponent(afdDomainName)}?api-version=2023-05-01`;
    const putRes = await fetch(putDomainUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          hostName: domainRow.domain,
          tlsSettings: {
            certificateType: "ManagedCertificate",
            minimumTlsVersion: "TLS12",
          },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!putRes.ok) {
      return {
        sslStatus: SslStatus.FAILED,
        diagnosticMessage: `Azure Front Door recusou o registro do domínio (HTTP ${putRes.status}).`,
      };
    }

    const afdData = (await putRes.json()) as {
      id?: string;
      properties?: {
        deploymentStatus?: string;
        domainValidationState?: string;
      };
    };

    // 3. Se endpoint e route foram informados, associar o AFDCustomDomain à rota de borda
    if (endpointName && routeName && afdData.id) {
      const routeUrl = `${baseUrl}/afdEndpoints/${encodeURIComponent(endpointName)}/routes/${encodeURIComponent(routeName)}?api-version=2023-05-01`;
      const routeGet = await fetch(routeUrl, {
        headers: { Authorization: `Bearer ${access_token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (routeGet.ok) {
        const routeJson = (await routeGet.json()) as {
          properties?: { customDomains?: Array<{ id: string }>; [k: string]: unknown };
        };
        const currentDomains = routeJson.properties?.customDomains ?? [];
        const alreadyLinked = currentDomains.some(
          (d) => d.id.toLowerCase() === afdData.id!.toLowerCase()
        );
        if (!alreadyLinked && routeJson.properties) {
          await fetch(routeUrl, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              properties: {
                ...routeJson.properties,
                customDomains: [...currentDomains, { id: afdData.id }],
              },
            }),
            signal: AbortSignal.timeout(15000),
          }).catch(() => undefined);
        }
      }
    }

    const validationState = afdData.properties?.domainValidationState?.toLowerCase() ?? "";
    const deploymentStatus = afdData.properties?.deploymentStatus?.toLowerCase() ?? "";

    if (validationState === "approved" && deploymentStatus === "succeeded") {
      return {
        sslStatus: SslStatus.ACTIVE,
        diagnosticMessage: "Certificado SSL gerenciado ativo no Azure Front Door.",
      };
    }
    if (validationState === "rejected" || deploymentStatus === "failed") {
      return {
        sslStatus: SslStatus.FAILED,
        diagnosticMessage: `Falha na validação/emissão do certificado no Azure Front Door (${validationState || deploymentStatus}).`,
      };
    }

    return {
      sslStatus: SslStatus.PROVISIONING,
      diagnosticMessage: `Certificado SSL em provisionamento no Azure Front Door (estado: ${validationState || "Pending"}).`,
    };
  } catch (err) {
    return {
      sslStatus: SslStatus.FAILED,
      diagnosticMessage: `Erro de comunicação com Azure Front Door: ${(err as Error).message}`,
    };
  }
}

export async function verifyCustomDomain(
  tenantId: string,
  domainId: string
): Promise<{
  domain: CustomDomainWithInstructions;
  verified: boolean;
  message: string;
}> {
  const row = await prisma.customDomain.findFirst({
    where: { id: domainId, tenantId },
  });
  if (!row) {
    throw new Error("Domínio não encontrado");
  }

  const targetExpected = row.cnameTarget.toLowerCase().replace(/\.$/, "");
  let cnameMatched = false;
  let txtMatched = false;
  let foundTargets: string[] = [];

  // 1. Verificar CNAME via dns.promises.resolveCname(domain)
  try {
    const cnames = await dns.resolveCname(row.domain);
    foundTargets = cnames.map((c) => c.toLowerCase().replace(/\.$/, ""));
    cnameMatched = foundTargets.includes(targetExpected);
  } catch {
    // CNAME pode não existir ou ser um domínio apex com CNAME flattening
  }

  // 2. Verificar registro TXT de propriedade (_stage-verify.{domain} ou no próprio domínio)
  const txtHosts = [`_stage-verify.${row.domain}`, row.domain];
  for (const th of txtHosts) {
    try {
      const txtRecords = await dns.resolveTxt(th);
      const flat = txtRecords.map((chunks) => chunks.join("").trim());
      if (flat.includes(row.verificationToken)) {
        txtMatched = true;
        break;
      }
    } catch {
      // ignora
    }
  }

  const isVerified = cnameMatched || txtMatched;
  const now = new Date();

  if (!isVerified) {
    const updated = await prisma.customDomain.update({
      where: { id: row.id },
      data: {
        dnsStatus: DnsStatus.FAILED,
        lastCheckedAt: now,
      },
    });
    await invalidateDomainMapping(row.domain);

    const detail =
      foundTargets.length > 0
        ? `CNAME atual aponta para "${foundTargets.join(", ")}", mas deveria apontar para "${targetExpected}".`
        : `Não encontramos o apontamento CNAME para "${targetExpected}" nem o registro TXT "${row.verificationToken}". Verifique a propagação DNS.`;

    return {
      domain: serializeDomain(updated),
      verified: false,
      message: detail,
    };
  }

  // DNS verificado: aciona/consulta provisionamento no Azure Front Door
  const afdResult = await provisionAzureFrontDoorCustomDomain(row);

  const updated = await prisma.customDomain.update({
    where: { id: row.id },
    data: {
      dnsStatus: DnsStatus.VERIFIED,
      sslStatus: afdResult.sslStatus,
      lastCheckedAt: now,
    },
  });

  await invalidateDomainMapping(row.domain);

  return {
    domain: {
      ...serializeDomain(updated),
      azureFrontDoorNote: afdResult.diagnosticMessage,
    },
    verified: true,
    message: afdResult.diagnosticMessage,
  };
}

export async function deleteCustomDomain(tenantId: string, domainId: string): Promise<void> {
  const row = await prisma.customDomain.findFirst({
    where: { id: domainId, tenantId },
  });
  if (!row) throw new Error("Domínio não encontrado");

  await prisma.customDomain.delete({ where: { id: row.id } });
  await invalidateDomainMapping(row.domain);
}

