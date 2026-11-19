import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { resolveCaddyTlsProbeTarget, sanitizeInternalRequestHeaders } from "../src/lib/config";

test("destinos TLS e resolução Docker Linux das duas topologias", () => {
  for (const [file, host] of [["docker-compose.yml", "caddy"], ["docker-compose.systemd-caddy.yml", "host.docker.internal"]]) {
    const config = parse(readFileSync(file, "utf8"));
    assert.equal(config.services.worker.environment.CADDY_TLS_PROBE_HOST, host);
    assert.deepEqual(resolveCaddyTlsProbeTarget({ NODE_ENV: "test", CADDY_TLS_PROBE_HOST: host }), { host, port: 443 });
    if (host === "host.docker.internal") assert.deepEqual(config.services.worker.extra_hosts, ["host.docker.internal:host-gateway"]);
  }
  for (const host of ["attacker.example", "https://caddy/path", "169.254.169.254"]) {
    assert.throws(() => resolveCaddyTlsProbeTarget({ NODE_ENV: "test", CADDY_TLS_PROBE_HOST: host }));
  }
});
test("headers internos são removidos e encaminhamento depende de proxy confiável", () => {
  const headers = new Headers({ "x-tenant-id": "forged", "x-forwarded-for": "203.0.113.1" });
  assert.equal(sanitizeInternalRequestHeaders(headers, { NODE_ENV: "test", TRUSTED_PROXY: "1" }).get("x-tenant-id"), null);
  assert.equal(sanitizeInternalRequestHeaders(headers, { NODE_ENV: "test", TRUSTED_PROXY: "0" }).get("x-forwarded-for"), null);
});
test("contrato Caddy mantém backend privado, redirecionamento e bloqueio interno nas variantes", () => {
  for (const file of ["Caddyfile", "Caddyfile.systemd"]) {
    const config = readFileSync(file, "utf8");
    assert.match(config, /redir https:\/\/\{host\}\{uri\} 308/);
    assert.match(config, /header_up X-Forwarded-For \{remote_host\}/);
    assert.match(config, /respond @internal_api "Forbidden" 403/);
    assert.match(config, /on_demand_tls/);
  }
});
