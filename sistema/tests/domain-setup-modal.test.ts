import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

const originalLoad = (Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load;

(Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown })._load = function (
  request: string,
  parent: unknown,
  isMain: boolean
) {
  if (request === "@/lib/use-i18n") {
    return { useI18n: () => ({ dict: { domains: {}, common: {} } }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getProviderGuides, describeDomainSetupState } = require("../src/components/site/DomainSetupModal") as {
  getProviderGuides: (
    mode?: "direct-ip" | "cname",
    targetIpv4?: string | null
  ) => Record<string, { name: string; steps: string[]; tip: string }>;
  describeDomainSetupState: (d: {
    dnsStatus: string;
    sslStatus: string;
    lastReasonCode?: string | null;
    lastError?: string | null;
  }) => { phase: string; dnsLabel: string; tlsLabel: string; summary: string; recoverable: boolean };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildDnsInstructions } = require("../src/lib/domains") as {
  buildDnsInstructions: (
    domainRow: { domain: string; verificationToken: string; zoneApex?: string | null },
    options?: { routingMode?: "direct-ip" | "cname"; targetIpv4?: string | null }
  ) => Array<{ type: string; host: string; fqdn: string; value: string; purpose: string }>;
};

describe("DomainSetupModal contratos e estados (Prompt 22)", () => {
  it("gera guias de provedores no modo VM (direct-ip) usando A -> 172.212.145.134 e TXT sem exigir ALIAS/CNAME na raiz", () => {
    const guides = getProviderGuides("direct-ip", "172.212.145.134");
    for (const key of ["registrobr", "cloudflare", "godaddy", "hostgator"]) {
      const g = guides[key];
      assert.ok(g, `Guia ${key} ausente`);
      const joined = `${g.steps.join(" ")} ${g.tip}`;
      assert.match(joined, /172\.212\.145\.134/);
      assert.match(joined, /\bA\b/);
      assert.match(joined, /\bTXT\b/);
      assert.doesNotMatch(joined, /selecione\s+['"]?CNAME['"]?/i);
      assert.doesNotMatch(joined, /requer ALIAS/i);
    }
  });

  it("gera registros A e TXT com nomes relativos e FQDNs completos para raiz e subdomínio", () => {
    const rootRecords = buildDnsInstructions(
      { domain: "minhaempresa.com.br", verificationToken: "tok-raiz", zoneApex: "minhaempresa.com.br" },
      { routingMode: "direct-ip", targetIpv4: "172.212.145.134" }
    );
    assert.equal(rootRecords[0].type, "A");
    assert.equal(rootRecords[0].host, "@");
    assert.equal(rootRecords[0].fqdn, "minhaempresa.com.br");
    assert.equal(rootRecords[0].value, "172.212.145.134");
    assert.equal(rootRecords[1].type, "TXT");
    assert.equal(rootRecords[1].host, "_stage-verify");
    assert.equal(rootRecords[1].fqdn, "_stage-verify.minhaempresa.com.br");

    const subRecords = buildDnsInstructions(
      { domain: "lp.minhaempresa.com.br", verificationToken: "tok-sub", zoneApex: "minhaempresa.com.br" },
      { routingMode: "direct-ip", targetIpv4: "172.212.145.134" }
    );
    assert.equal(subRecords[0].type, "A");
    assert.equal(subRecords[0].host, "lp");
    assert.equal(subRecords[0].fqdn, "lp.minhaempresa.com.br");
    assert.equal(subRecords[1].type, "TXT");
    assert.equal(subRecords[1].host, "_stage-verify.lp");
    assert.equal(subRecords[1].fqdn, "_stage-verify.lp.minhaempresa.com.br");
  });

  it("descreve corretamente os estados reais: pendente, erro de DNS, TLS em emissão, falha TLS e pronto", () => {
    const pending = describeDomainSetupState({ dnsStatus: "PENDING", sslStatus: "PENDING" });
    assert.equal(pending.phase, "dns_pending");
    assert.equal(pending.recoverable, true);

    const dnsErr = describeDomainSetupState({
      dnsStatus: "FAILED",
      sslStatus: "PENDING",
      lastReasonCode: "DNS_WRONG_TARGET",
      lastError: "Registro A aponta para outro IP.",
    });
    assert.equal(dnsErr.phase, "dns_failed");
    assert.equal(dnsErr.recoverable, true);
    assert.match(dnsErr.summary, /outro IP/);

    const tlsProv = describeDomainSetupState({ dnsStatus: "VERIFIED", sslStatus: "PROVISIONING" });
    assert.equal(tlsProv.phase, "tls_provisioning");
    assert.equal(tlsProv.tlsLabel, "TLS em emissão");
    assert.equal(tlsProv.recoverable, true);

    const tlsFail = describeDomainSetupState({
      dnsStatus: "VERIFIED",
      sslStatus: "FAILED",
      lastError: "Timeout ao emitir certificado.",
    });
    assert.equal(tlsFail.phase, "tls_failed");
    assert.equal(tlsFail.recoverable, true);

    const ready = describeDomainSetupState({ dnsStatus: "VERIFIED", sslStatus: "ACTIVE" });
    assert.equal(ready.phase, "ready");
    assert.equal(ready.tlsLabel, "HTTPS ativo");
    assert.equal(ready.recoverable, false);
  });
});
