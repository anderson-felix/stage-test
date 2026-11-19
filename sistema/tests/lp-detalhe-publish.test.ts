import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";
import type { CustomDomainWithInstructions } from "../src/lib/domains";

const originalLoad = (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load;

(Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "next/navigation") {
    return { useRouter: () => ({ push: () => {}, refresh: () => {} }) };
  }
  if (request === "@/lib/use-i18n") {
    return { useI18n: () => ({ dict: { ads: {}, domains: {}, common: {} }, locale: "pt-BR" }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { evaluatePublishDomainReadiness, resolveCanonicalPublishedUrl } = require("../src/components/ads/LPDetalhe") as {
  evaluatePublishDomainReadiness: (
    selectedDomain: CustomDomainWithInstructions | null | undefined,
    options: { lpFallbackEnabled: boolean; fallbackDomain: string | null }
  ) => { canPublish: boolean; reason: string | null; badge: string };
  resolveCanonicalPublishedUrl: (
    lp: { status: string; urlPublicada: string; requiresDomainReassociation?: boolean },
    serverPublicUrl?: string | null
  ) => string;
};

function makeDomain(overrides: Partial<CustomDomainWithInstructions>): CustomDomainWithInstructions {
  return {
    id: "dom-1",
    tenantId: "t1",
    domain: "lp.cliente.com.br",
    isSubdomain: true,
    zoneApex: "cliente.com.br",
    registrableDomain: "cliente.com.br",
    dnsProviderHint: null,
    verificationToken: "tok",
    routingMode: "direct-ip",
    routingTarget: "172.212.145.134",
    targetIpv4: "172.212.145.134",
    tlsProvider: "caddy",
    cnameTarget: null,
    dnsStatus: "VERIFIED",
    sslStatus: "ACTIVE",
    isDefault: true,
    homeLandingPageId: null,
    lastCheckedAt: null,
    nextCheckAt: null,
    checkAttempts: 0,
    consecutiveFailures: 0,
    lastReasonCode: null,
    lastError: null,
    createdAt: new Date().toISOString(),
    records: [],
    ...overrides,
  };
}

describe("LPDetalhe seleção de domínio e publicação (Prompt 23)", () => {
  it("bloqueia publicação sem domínio quando fallback está desativado", () => {
    const res = evaluatePublishDomainReadiness(null, {
      lpFallbackEnabled: false,
      fallbackDomain: null,
    });
    assert.equal(res.canPublish, false);
    assert.match(res.reason ?? "", /domínio próprio/i);
  });

  it("bloqueia domínio com DNS pendente ou TLS pendente e libera apenas quando pronto", () => {
    const dnsPending = evaluatePublishDomainReadiness(
      makeDomain({ dnsStatus: "PENDING", sslStatus: "PENDING" }),
      { lpFallbackEnabled: false, fallbackDomain: null }
    );
    assert.equal(dnsPending.canPublish, false);
    assert.match(dnsPending.badge, /DNS PENDING/);

    const tlsPending = evaluatePublishDomainReadiness(
      makeDomain({ dnsStatus: "VERIFIED", sslStatus: "PROVISIONING" }),
      { lpFallbackEnabled: false, fallbackDomain: null }
    );
    assert.equal(tlsPending.canPublish, false);
    assert.match(tlsPending.badge, /TLS PROVISIONING/);

    const ready = evaluatePublishDomainReadiness(
      makeDomain({ dnsStatus: "VERIFIED", sslStatus: "ACTIVE" }),
      { lpFallbackEnabled: false, fallbackDomain: null }
    );
    assert.equal(ready.canPublish, true);
    assert.equal(ready.reason, null);
  });

  it("nunca constrói URL falsa em rascunho/despublicada e exibe URL canônica do servidor quando publicada", () => {
    assert.equal(
      resolveCanonicalPublishedUrl({
        status: "rascunho",
        urlPublicada: "https://lp.cliente.com.br/oferta",
      }),
      ""
    );

    assert.equal(
      resolveCanonicalPublishedUrl(
        {
          status: "publicada",
          urlPublicada: "",
        },
        "https://lp.cliente.com.br/oferta"
      ),
      "https://lp.cliente.com.br/oferta"
    );

    assert.equal(
      resolveCanonicalPublishedUrl({
        status: "publicada",
        urlPublicada: "https://cliente.lp.stage.consult/oferta",
        requiresDomainReassociation: true,
      }),
      ""
    );
  });
});

