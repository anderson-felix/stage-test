// Executar DENTRO do worker: npx tsx scripts/probe-lp-tls.ts lp.cliente.com
import https from "node:https";
import { resolveCaddyTlsProbeTarget, parseAndValidateHost } from "../src/lib/config";
const domain = process.argv[2];
if (!domain || !parseAndValidateHost(domain).isValid || domain.includes(":")) throw new Error("Informe apenas o domínio do cliente");
const target = resolveCaddyTlsProbeTarget();
const req = https.get({ hostname: target.host, port: target.port, servername: domain,
  rejectUnauthorized: true, headers: { Host: domain }, path: "/", timeout: 15000 }, (res) => {
  console.log(JSON.stringify({ tls: "valid", httpStatus: res.statusCode, domain, target }));
  res.resume(); // HTTP 404 é compatível com handshake válido antes da publicação.
});
req.on("timeout", () => req.destroy(new Error("TLS probe timeout")));
req.on("error", (err) => { console.error(err.message); process.exitCode = 1; });
