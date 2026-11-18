# Progresso de Domínios Customizados & Deploy na VM (`Stage-hub-mkt-dev`)

Registro vivo de diagnóstico, decisões arquiteturais, evidências de código, validações e bloqueios para operação do painel e publicação de Landing Pages (LPs) com domínios de clientes na VM de desenvolvimento/homologação.

---

## 1. Contexto do Ambiente e Arquitetura Alvo

| Item | Definição |
|---|---|
| **Instância / VM** | `Stage-hub-mkt-dev` |
| **Sistema Operacional** | Ubuntu 22.04 LTS |
| **IP Público Estático** | `172.212.145.134` |
| **Portas de Rede** | `80/TCP` e `443/TCP` liberadas no firewall/NSG |
| **Reverse Proxy / TLS** | **Caddy** em execução na VM |
| **Acesso ao Painel SaaS** | Temporariamente via **HTTP pelo IP público** (`http://172.212.145.134`) |
| **Domínios de Clientes (LPs)** | **HTTPS gerenciado pelo Caddy** (On-Demand TLS), **sem depender do Azure Front Door** |
| **Armazenamento em Produção** | Manter **Azure Blob Storage** (`@azure/storage-blob`) para ativos de mídia e HTML publicado das LPs |
| **Acesso à VM neste ambiente** | **Indisponível localmente** (execução local em workspace Windows; sem sessão SSH ativa para `172.212.145.134`) |

---

## 2. Estado do Repositório Local

- **Repositório remoto (`origin`)**: `https://github.com/anderson-felix/stage-test.git`
- **Branch atual**: `master`
- **Commit `HEAD` base**: `e427e89` (`fix: improvements`)
- **Relação com o commit de referência (`2dd9d53`)**: O commit `2dd9d53` citado no diagnóstico de referência não consta no histórico local de `master` (que inicia em `4d2276d` e segue até `e427e89`). Portanto, o código atual em `e427e89` foi integralmente inspecionado e confirmado antes de qualquer modificação.
- **Stack verificada em `sistema/package.json`**: Next.js `16.4.0` (`src/proxy.ts`), React `19.3.0`, Prisma `6.5.0`, `@azure/storage-blob` `^12.34.0`, `ioredis` `^6.0.0`, `jose` `^6.2.12`.

---

## 3. Configurações Decididas e Implementadas

### 3.1 Variáveis de Ambiente Server-Side Validadas (`src/lib/config.ts` & `.env.example`)
Configuração canônica em runtime (sem inlining estático de build e sem credenciais em build args):

```dotenv
APP_PANEL_HOST="172.212.145.134"
APP_BASE_URL="http://172.212.145.134"
DOMAIN_ROUTING_MODE="direct-ip"
DOMAIN_TARGET_IPV4="172.212.145.134"
DOMAIN_TLS_PROVIDER="caddy"
LP_FALLBACK_ENABLED="false"
TRUSTED_PROXY="0"
COOKIE_SECURE="0"
```

- **Prevenção de fontes conflitantes**: `getAppRuntimeConfig()` valida que `APP_PANEL_HOST` e `APP_BASE_URL` não possuam hosts divergentes quando ambos são informados; se apenas um for informado, o outro é derivado automaticamente. Variáveis legadas (`HUB_HOST`, `NEXT_PUBLIC_APP_DOMAIN`, `NEXT_PUBLIC_APP_URL`) são aceitas apenas como fallback quando as variáveis canônicas não estão definidas.
- **Leitura centralizada e segura do `Host` (`extractRequestHost`)**:
  - `X-Forwarded-Host` só é lido quando `TRUSTED_PROXY` está explicitamente habilitado (`"1"` ou `"true"`).
  - Foi **removida** a confiança baseada na simples presença do cabeçalho `x-azure-fdid`.
  - `sanitizeInternalRequestHeaders()` remove `x-tenant-id`, `x-pathname`, `x-locale`, `x-user-id`, `x-user-role`, `x-is-super-admin` e `x-azure-fdid` de qualquer requisição externa, além de remover `x-forwarded-*` quando `TRUSTED_PROXY` está desabilitado.
- **Geração server-side de URLs do painel (`buildAppPanelUrl` / `getAppBaseUrl`)**:
  - Redirecionamentos do painel em `src/proxy.ts` (`/login`, `/conta?obrigatoria=1`, `/`) usam `buildAppPanelUrl()`, impedindo que um `X-Forwarded-Host` ou `X-Forwarded-Proto` forjado contamine `request.url`.

### 3.2 Política de Cookies de Sessão (`src/lib/auth.ts`)
- **Padrão seguro em produção**: Em `NODE_ENV="production"` sem `COOKIE_SECURE` declarado, `resolveSessionCookieSecure()` exige `secure: true`.
- **Obrigatoriedade em HTTPS**: Sempre que `APP_BASE_URL` usar `https://`, `resolveSessionCookieSecure()` exige `secure: true` incondicionalmente (mesmo se `COOKIE_SECURE=0` estiver definido).
- **Exceção temporária explícita na VM (HTTP por IP sem alterar `NODE_ENV`)**: Enquanto `APP_BASE_URL` usar HTTP sobre IPv4 (`http://172.212.145.134`) ou loopback, declarar `COOKIE_SECURE=0` permite `secure: false` mantendo `NODE_ENV=production`. Em domínios não-IP em produção, `COOKIE_SECURE=0` é ignorado e `secure: true` é mantido.
- **Isolamento de escopo e coerência Login/Renovação/Logout**:
  - `getSessionCookieOptions()`, `createSession()` e `buildClearedSessionCookie()` compartilham a mesma política: `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, `secure: resolveSessionCookieSecure()`.
  - O atributo `Domain` **nunca** é definido (cookie *host-only*), impedindo compartilhamento de sessão com domínios de clientes.

### 3.3 Entrada Canônica de Hostnames, Public Suffix List (PSL) e Zonas Delegadas (`src/lib/domains.ts`, `src/lib/redis.ts`, `src/app/api/domains/route.ts`)
- **Normalização Canônica (`parseCustomDomainHostname` / `normalizeHostname`)**:
  - Aceita domínios raiz (apex) e subdomínios; normaliza maiúsculas, ponto final único de FQDN DNS (`.`) e IDNs para Punycode ASCII (`node:url` `domainToASCII` + validação reversa `domainToUnicode`).
  - Recusa estritamente: IPs (IPv4/IPv6 e TLDs numéricos), `localhost` e sufixos reservados, host do painel (`APP_PANEL_HOST` / `APP_BASE_URL`), `.stage.consult`, protocolos (`http://`, `https://`, `//`), credenciais (`@`), portas (`:80`, `:443`), caminhos/query/fragmento (`/`, `\`, `?`, `#`), wildcard (`*`), labels inválidos e sufixos públicos puros (`com.br`, `med.br`, `co.uk`, etc.).
- **Resolução de Zona via Public Suffix List e Suporte a Zonas Delegadas (`resolvePublicSuffix` / `detectIsSubdomain`)**:
  - Distingue `registrableDomain` (eTLD+1 da PSL) de `zoneApex` (zona DNS autoritativa), não tratando o sufixo registrável como prova da zona autoritativa (`isAuthoritativeZoneConfirmed: false` por padrão) e suportando `zoneApex` explícita para zonas delegadas.
- **Unicidade Global, Autorização por Tenant e Concorrência (`registerCustomDomain` / `deleteCustomDomain`)**:
  - Confirma o mapeamento canônico antes de persistir, combina lock por domínio canônico, transação `prisma.$transaction` e tratamento determinístico de erro Prisma `P2002` (HTTP `409`).

### 3.4 Contrato e Geração de Instruções DNS Desacoplados (`src/lib/domains.ts` — Tarefa 05)
- **Separação entre Destino de Roteamento e Provedor TLS (`resolveDomainRoutingContract`)**:
  - O contrato `CustomDomainWithInstructions` expõe `routingMode` (`"direct-ip"` | `"cname"`), `routingTarget`, `targetIpv4`, `cnameTarget` (`string | null`), `tlsProvider` (`"caddy"` | `"frontdoor"` | `"manual"`), `zoneApex` e `registrableDomain`.
  - Proíbe o uso de endereço IP em `CNAME_TARGET` (tanto em `src/lib/config.ts` quanto em `resolveDomainRoutingContract`).
- **Modo `direct-ip` (`DOMAIN_ROUTING_MODE="direct-ip"`)**:
  - Gera registro **`A`** apontando para `DOMAIN_TARGET_IPV4` (`172.212.145.134`) tanto para subdomínios (`lp.exemplo.com` -> `A` em `lp`, `fqdn: "lp.exemplo.com"`) quanto para domínio raiz (`exemplo.com` -> `A` em `@`, `fqdn: "exemplo.com"`), sem exigir `ALIAS/ANAME` nem `CNAME`.
  - Gera registro **`TXT`** com o token exclusivo do cadastro (`_stage-verify.lp` com `fqdn: "_stage-verify.lp.exemplo.com"` para subdomínio; `_stage-verify` com `fqdn: "_stage-verify.exemplo.com"` para raiz; ou relativo à `zoneApex` informada em zonas delegadas).
- **Tratamento Não-Destrutivo de Cadastros Antigos**:
  - Registros existentes preservam IDs, tokens, `tenantId` e vínculos, retornando no modo `direct-ip` `cnameTarget: null`, `targetIpv4: "172.212.145.134"` e instruções `A` + `TXT`.

### 3.5 Verificação DNS Estrita no Modo `direct-ip` (`verifyCustomDomain` — Tarefa 06)
- **Exigência Simultânea de `A` e `TXT` (Raiz e Subdomínio)**:
  - No modo `direct-ip`, `verifyCustomDomain()` exige **simultaneamente**:
    1. Resolução `A` (`resolve4(canonicalDomain)`) apontando **exclusivamente** para `DOMAIN_TARGET_IPV4` (`172.212.145.134`);
    2. Registro `TXT` em `_stage-verify.<canonicalDomain>` contendo o `verificationToken` exclusivo do cadastro;
    3. Ausência de registros `AAAA` (`resolve6(canonicalDomain)`) sem IPv6 aprovado na VM.
  - Não aceita apenas `TXT` ou apenas `A` (classifica como `DNS_PROPAGATING_PARTIAL`).
- **Classificação Precisa de Falhas (`reasonCode`) e Proteção contra Falhas Transitórias**:
  - Diferencia "sem registro" (`ENODATA`, `ENOTFOUND`, `NXDOMAIN` -> `status: "no_record"`) de timeout (`ETIMEOUT` -> `DNS_TIMEOUT`) e erro transitório do resolvedor (`ESERVFAIL`, `EAI_AGAIN`, `EREFUSED` -> `DNS_RESOLVER_ERROR`).
  - Detecta múltiplos endereços `A` conflitantes (`DNS_CONFLICTING_A_RECORDS`), IP de destino incorreto (`DNS_WRONG_TARGET`), token `TXT` incorreto (`DNS_WRONG_TXT_TOKEN`), `AAAA` incompatível (`DNS_AAAA_CONFLICT`), configuração parcial/propagação (`DNS_PROPAGATING_PARTIAL`) e ausência total (`DNS_MISSING_RECORDS`).
  - Em falhas transitórias (`DNS_TIMEOUT` / `DNS_RESOLVER_ERROR`), marca `transient: true` e preserva `dnsStatus` e `sslStatus` existentes (não rebaixa domínios já `VERIFIED`/`ACTIVE`).
- **Desacoplamento do Azure Front Door no Modo Caddy**:
  - Quando `tlsProvider === "caddy"` (ou `"manual"`), **nunca** invoca `provisionAzureFrontDoorCustomDomain`.
  - Após sucesso DNS, persiste `dnsStatus = VERIFIED` e encaminha `sslStatus` para `PROVISIONING` (sem inventar `ACTIVE`), preservando `SslStatus.ACTIVE` caso o certificado já estivesse ativo em rechecagens subsequentes.

### 3.6 Agendamento de Domínios, Backoff Limitado, Concorrência e Revalidação Periódica (Tarefa 07)
- **Campos de Controle Aditivos em `CustomDomain` (`prisma/schema.prisma` + migração `20261117000000_custom_domain_scheduling`)**:
  - `nextCheckAt`, `checkAttempts`, `consecutiveFailures`, `lastReasonCode`, `lastError`, `lockedUntil` e `lockedBy`, com índices em `[dnsStatus, nextCheckAt, lastCheckedAt]` e `[sslStatus, nextCheckAt]`.
- **Política de Backoff Limitado e Recuperação pós-Propagação**:
  - Uma primeira verificação antes da propagação (`dnsStatus = FAILED`) **nunca** abandona o domínio: `processPendingCustomDomains` seleciona domínios com `dnsStatus IN (PENDING, FAILED)` cujo `nextCheckAt <= now`.
  - **Propagação / falha de DNS**: `[1m, 2m, 5m, 10m, 20m, 30m, máx 60m]`.
  - **Falha transitória (`DNS_TIMEOUT` / `DNS_RESOLVER_ERROR`)**: `[1m, 2m, 5m, 10m, máx 15m]`.
  - **DNS `VERIFIED` com TLS em `PENDING` / `PROVISIONING` / `FAILED`**: `[1m, 2m, 5m, 15m, máx 30m]`.
  - **Ordenação Justa (Anti-Starvation)**: Seleção ordenada por `nextCheckAt ASC (NULLS FIRST)`, `lastCheckedAt ASC (NULLS FIRST)`, `createdAt ASC` e `id ASC`.
- **Proteção de Concorrência, Transações e Rate Limit Manual**:
  - Guarda de reentrância por `workerId` (`activeDomainSchedulerCycles`) + lease por domínio (`inFlightDomainLocks` e `lockedUntil` de 30s) evitam execução simultânea entre ciclos/instâncias.
  - Consultas DNS externas executam **sem transação de banco aberta** (`prisma.$transaction` não é utilizado durante `verifyCustomDomain`).
  - Rechecagem manual (`POST /api/domains` com `action: "verify"` ou `trigger: "manual"`) preservada com rate limit distribuído/memória (`5 req / 60s` por domínio, retornando HTTP `429` + `Retry-After`).
- **Política Documentada de Revalidação Periódica de Domínios Ativos (`VERIFIED` + `ACTIVE`, intervalo de 6h)**:
  - **Timeout transitório / erro do resolvedor (`transient: true`)**: **não** revoga `dnsStatus = VERIFIED` nem `sslStatus = ACTIVE`, não invalida o cache de mapeamento (`getDomainMapping`) e reagenda verificação curta (`1m..15m`).
  - **Mudança confirmada de propriedade ou destino (`transient: false`: `DNS_WRONG_TARGET`, `DNS_CONFLICTING_A_RECORDS`, `DNS_WRONG_TXT_TOKEN`, `DNS_AAAA_CONFLICT`, `DNS_MISSING_RECORDS`, `DNS_PROPAGATING_PARTIAL`)**: retira imediatamente a autorização (`dnsStatus -> FAILED`, `sslStatus -> PENDING`), chama `invalidateDomainMapping(canonicalDomain)` para limpar o cache de roteamento e agenda nova tentativa com backoff limitado.

### 3.7 Autorização On-Demand TLS do Caddy (`GET /api/internal/caddy/allow` & Exceção Exata no Proxy)
- **Endpoint Interno (`src/app/api/internal/caddy/allow/route.ts` & `checkCaddyOnDemandTlsAllow` em `src/lib/domains.ts`)**:
  - Responde `200 OK` **somente** quando:
    1. O parâmetro `domain` é um hostname canônico válido e não reservado (`trimmed === parsed.canonicalDomain`), rejeitando antes do banco qualquer IP (`172.212.145.134`, `127.0.0.1`), `localhost`, `.stage.consult`, sufixo público puro (`com.br`), porta, protocolo, wildcard ou forma não-canônica (maiúsculas / ponto final no SNI);
    2. O registro existe em `CustomDomain` (consulta curta e indexada `findUnique({ where: { domain: canonicalDomain } })` com timeout de 3s);
    3. `tenant.isActive === true`;
    4. `dnsStatus === VERIFIED` e válido conforme a política de validade (sem `lastReasonCode` de falha definitiva, `consecutiveFailures <= 5` e `lastCheckedAt` dentro da janela máxima de 7 dias).
  - **Não exige `sslStatus === ACTIVE` nem LP publicada**: autoriza a emissão do primeiro certificado TLS assim que o DNS está `VERIFIED`.
  - **Somente leitura e sem efeitos colaterais**: não consulta DNS, não emite certificado e não altera nenhum estado no banco.
  - **Fail-closed**: qualquer indisponibilidade, exceção ou timeout do banco retorna `503` (`allowed: false, reason: "database_error"`), negando a emissão.
- **Exceção Exata em `src/proxy.ts` (`CADDY_INTERNAL_ALLOW_PATH = "/api/internal/caddy/allow"`)**:
  - Permite apenas `GET /api/internal/caddy/allow` quando recebido em host interno/loopback/painel (`isInternalCaddyRequestHost`: `127.0.0.1`, `localhost`, `web` ou host do painel), negando com `403` em domínios públicos de clientes e `405` para outros métodos HTTP.
  - **Não abre genericamente `/api/internal`** (qualquer outra rota sob `/api/internal/*` continua exigindo autenticação) e **não confia em cabeçalhos arbitrários enviados pelo cliente**.
- **Contrato Obrigatório de Proteção de Rede antes do Deploy (Tarefa 08 — Bloqueio de Implantação Pública Isolada)**:
  - **PROIBIDO implantar este endpoint publicamente de forma isolada antes da Tarefa 08**:
    1. **Bloqueio na borda do Caddy (`Caddyfile`)**: nos listeners públicos (`:80` e `:443`), o Caddy deve bloquear explicitamente qualquer requisição externa para `/api/internal` e `/api/internal/*` (`respond 403` antes do `reverse_proxy`), garantindo que apenas o cliente interno `on_demand_tls { ask ... }` do próprio Caddy alcance a rota.
    2. **Privacidade da porta do backend (`3000`/`3100`)**: o processo/container Next.js deve escutar exclusivamente em loopback (`127.0.0.1:3000:3000`) ou na rede interna isolada do Docker Compose (`expose: ["3000"]` sem publicação em `0.0.0.0:3000` e com portas `3000`/`3100` bloqueadas no firewall/NSG da VM).

### 3.8 Configuração do `Caddyfile` e Isolamento de Rede (Variantes Compose vs `systemd`)
- **Versão Testada e Fixada do Caddy**: `caddy:2.9.1-alpine` (validada com binário oficial `Caddy v2.9.1`).
- **Separação HTTP (IP do Painel) vs HTTPS On-Demand TLS (Domínios de Clientes)**:
  - `http://{$APP_PANEL_HOST:172.212.145.134}, http://127.0.0.1, http://localhost`: atende o Painel SaaS em HTTP sem redirecionar para HTTPS e sem acionar emissão TLS.
  - `https://` com `tls { on_demand }`: atende domínios de clientes em HTTPS consultando `on_demand_tls { ask ... }` (`/api/internal/caddy/allow`) antes de qualquer emissão/renovação.
- **Proteção de Borda, Cabeçalhos e Streaming**:
  - Bloqueia `/api/internal` e `/api/internal/*` (`respond @internal_api "Forbidden" 403`) antes do `reverse_proxy` em ambos os blocos HTTP e HTTPS.
  - Preserva `Host` (`{http.request.hostport}`), sobrescreve cabeçalhos de proxy confiáveis (`X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-For`, `X-Real-IP`) a partir da conexão real e remove cabeçalhos externos capazes de forjar contexto interno (`-X-Tenant-Id`, `-X-Pathname`, `-X-Locale`, `-X-User-Id`, `-X-User-Role`, `-X-Is-Super-Admin`, `-X-Azure-Fdid`, `-X-Internal-Request`, `-X-Caddy-Ask`).
  - Preserva streaming de IA e SSE/NDJSON em tempo real com `flush_interval -1`.
  - Mantém API administrativa privada (`admin 127.0.0.1:2019`, sem publicação de porta `2019`) e persistência de certificados/dados (`caddy-data:/data` e `caddy-config:/config` no Compose; `/var/lib/caddy/.local/share/caddy` no `systemd`).
- **Variantes Separadas Preparadas (Decisão Pendente conforme Modo do Caddy na VM — Proibido Disputar `80/443`)**:
  - **Variante A (Caddy + Web no Docker Compose)**: [`sistema/Caddyfile`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/Caddyfile) (`upstream web:3000`, `ask http://web:3000/api/internal/caddy/allow`) + [`sistema/docker-compose.yml`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/docker-compose.yml) (`web` com `expose: ["3000"]` e sem portas públicas `3000`/`3100`; `caddy:2.9.1-alpine` em `80/443`). Exige que eventual `caddy.service` do `systemd` no host esteja desabilitado.
  - **Variante B (Caddy via `systemd` no host Ubuntu 22.04)**: [`sistema/Caddyfile.systemd`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/Caddyfile.systemd) (`upstream 127.0.0.1:3000`, `ask http://127.0.0.1:3000/api/internal/caddy/allow`) + [`sistema/docker-compose.systemd-caddy.yml`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/docker-compose.systemd-caddy.yml) (sem container `caddy` para não disputar `80/443`, e `web` vinculado estritamente a `127.0.0.1:3000:3000`).

### 3.9 Reconciliação de Certificado TLS do Provedor Caddy (`reconcileCaddyDomainTls` e Integração no Worker)
- **Ordem Estrita de Persistência e Ausência de Deadlock ("Publicar para Emitir / Emitir para Publicar")**:
  - Somente depois que `dnsStatus = VERIFIED` está persistido no banco por `verifyCustomDomain`, o worker inicia a conexão TLS controlada ao Caddy (`reconcileCaddyDomainTls`).
  - Quando o Caddy recebe o handshake com SNI do domínio do cliente, sua chamada `ask` (`GET /api/internal/caddy/allow?domain=HOST`) encontra `dnsStatus = VERIFIED` já persistido e autoriza a emissão mesmo sem nenhuma LP publicada (`landingPages = []`).
  - `HTTP 404` retornado sobre o socket TLS antes da primeira LP publicada é tratado como válido e permite a ativação de `sslStatus = ACTIVE` sem exigir publicação prévia.
- **Destino de Conexão Aprovado pelo Servidor (`resolveCaddyTlsProbeTarget` em `src/lib/config.ts`)**:
  - Lê exclusivamente `CADDY_TLS_PROBE_HOST` e `CADDY_TLS_PROBE_PORT` da configuração server-side, aceitando apenas destinos aprovados (`caddy`, `127.0.0.1`, `localhost` ou o IP/host configurado da VM, ex.: `caddy:443` no Compose ou `127.0.0.1:443` no `systemd`) e mantendo `servername` igual ao hostname canônico do cliente.
  - Recusa destinos arbitrários enviados por usuário, URLs com protocolo/caminho, redirecionamentos HTTP (`HEAD /` com `Connection: close` sem seguir `3xx`) ou qualquer tentativa de desativar validação TLS (`rejectUnauthorized = false` lança `DomainValidationError`).
  - **Nota**: Esta checagem interna não substitui o teste público real posterior na VM.
- **Validação X.509 e Máquina de Estados TLS**:
  - Valida cadeia confiável (`authorized === true` e ausência de erro de cadeia), correspondência de hostname (`tls.checkServerIdentity` + `SAN`/`CN`) e validade temporal (`valid_from <= now < valid_to`).
  - **Sucesso (`TLS_ACTIVE`)**: marca `sslStatus = ACTIVE`, zera `checkAttempts` e `consecutiveFailures`, limpa `lastError = null` e agenda revalidação periódica em `+6h` (`DOMAIN_ACTIVE_REVALIDATION_INTERVAL_MS`), sem disparar emissões ou sondagens desnecessárias nos ciclos intermediários.
  - **Emissão inicial em curso / timeout (`TLS_TIMEOUT` / `TLS_CONNECT_ERROR` enquanto `PENDING`/`PROVISIONING`)**: mantém `sslStatus = PROVISIONING` com retentativas (`1m..30m`) e registra diagnóstico em `lastError` / `lastReasonCode`.
  - **Falha de validação do certificado (`TLS_HOSTNAME_MISMATCH`, `TLS_UNTRUSTED_CHAIN`, `TLS_CERT_EXPIRED`, `TLS_CERT_NOT_YET_VALID`, `TLS_INVALID_CERT`)**: marca `sslStatus = FAILED`, registra diagnóstico detalhado em `lastError`, invalida o cache de mapeamento e agenda retentativa com backoff limitado.

### 3.10 Endpoint Mínimo de Saúde (`GET /api/health`) e Correção do Healthcheck do Compose
- **Substituição da dependência em `/api/status` protegido**:
  - `/api/status` permanece estritamente privado (`exigirSessao("VIEWER")` e bloqueado com `401` sem cookie em `src/proxy.ts`).
  - Criado [`sistema/src/app/api/health/route.ts`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/src/app/api/health/route.ts) (`GET` e `HEAD /api/health`) consultável sem cookie de sessão em hosts internos/loopback/painel (`127.0.0.1`, `localhost`, `web` ou host do painel), e bloqueado com `403` em domínios públicos de LPs de clientes.
- **Distinção entre Liveness, Inicialização/Migrations e Readiness de Dependência Essencial**:
  - Processo vivo (`?probe=liveness`): retorna `200 OK` (`{ status: "ok", live: true, ready: true, checks: { database: "ok" } }`).
  - Prontidão padrão (`GET /api/health` usado pelo Docker Compose): verifica conectividade com o PostgreSQL e existência do schema migrado (`prisma.tenant.findFirst({ select: { id: true } })` com timeout de 2.5s):
    - **Saudável (`200 OK`)**: `{ status: "ok", live: true, ready: true, checks: { database: "ok" } }`.
    - **Migrations / inicialização incompletas (`503 Service Unavailable`, códigos `P2021`/`P2022`/`42P01`)**: `{ status: "initializing", live: true, ready: false, checks: { database: "initializing" } }`.
    - **Banco indisponível / timeout (`503 Service Unavailable`)**: `{ status: "unavailable", live: true, ready: false, checks: { database: "unavailable" } }`.
  - **Sem vazamento de dados internos**: retorna apenas o resumo (`status`, `live`, `ready`, `checks.database`), sem expor versões, segredos, URLs de conexão ou stack traces.
- **Ajuste no Proxy e no Docker Compose**:
  - Exceção exata `pathname === "/api/health"` (`GET`/`HEAD`) em [`sistema/src/proxy.ts`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/src/proxy.ts#L96-L111), mantendo `/api/status` e `/api/internal/*` protegidos.
  - Healthcheck do serviço `web` em [`sistema/docker-compose.yml`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/docker-compose.yml#L53-L58) e [`sistema/docker-compose.systemd-caddy.yml`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/docker-compose.systemd-caddy.yml#L54-L59) ajustado para `curl -fsS -H 'Host: 127.0.0.1:3000' http://127.0.0.1:3000/api/health || exit 1`, e `worker.depends_on.web` ajustado para `condition: service_healthy`.

### 3.11 Azure Blob Storage para Publicação de LPs e Mídia (`src/lib/storage.ts` e Rotas Associadas)
- **Validação Estrita sem Vazamento de Segredos e sem Fallback em Disco**:
  - `resolveAzureStorageConfig()`, `validateAzureConnectionString()` e `validateAzureContainerName()` em [`sistema/src/lib/storage.ts`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/src/lib/storage.ts) validam obrigatoriamente `AZURE_STORAGE_CONNECTION_STRING` e `AZURE_STORAGE_CONTAINER_NAME` em runtime sem jamais exibir seus valores e sem recorrer a fallback em disco local (`resolveDevBlobPath` removido), independentemente de `NODE_ENV`.
  - `sanitizeStorageErrorMessage()` redige automaticamente `AccountKey`, `SharedAccessSignature` e `sig` caso qualquer exceção subjacente os mencione.
- **Container Privado, Prefixos por Tenant e Leitura Mediada pelo Backend**:
  - `createIfNotExists()` preserva o container **privado** (sem `access: "blob"` ou `"container"`).
  - Objetos seguem estritamente `{tenantId}/{category}/{yyyy-mm}/{safeName}` (`buildBlobKey`), e `downloadTenantAssetBuffer` / `deleteTenantAssetBlob` validam `expectedTenantId` contra o prefixo do blob (`TENANT_PREFIX_MISMATCH` -> HTTP `403`).
- **Falhas Claras e Proteção contra Publicação com Referência Inválida**:
  - Em `uploadTenantAsset`, `prisma.mediaAsset.create` só é executado após o upload no Azure Blob Storage suceder e retornar uma URL HTTP(S) válida com o prefixo do tenant (e, se o insert no banco falhar, o blob órfão é removido via `deleteBlob`).
  - Em [`sistema/src/app/api/lp/[slug]/publicar/route.ts`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/src/app/api/lp/%5Bslug%5D/publicar/route.ts), qualquer erro no `uploadTenantAsset` aborta a publicação com HTTP `503` antes de `prisma.landingPage.update`, impedindo que uma LP seja marcada como `PUBLISHED` com referência inválida.
  - Em [`sistema/src/app/lp-public/[host]/[slug]/route.ts`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/src/app/lp-public/%5Bhost%5D/%5Bslug%5D/route.ts) e [`sistema/src/app/api/media/[id]/route.ts`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/src/app/api/media/%5Bid%5D/route.ts), falhas de leitura do storage retornam HTTP `503` claro (sem mascarar indisponibilidade com `draftHtml` não publicado).
- **Onde Configurar e Como Verificar Persistência**:
  - Configurar `AZURE_STORAGE_CONNECTION_STRING` e `AZURE_STORAGE_CONTAINER_NAME` em `sistema/.env` (documentado em [`sistema/.env.example`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/.env.example) e [`sistema/docs/DEPLOY.md`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/docs/DEPLOY.md)).
  - Para verificar persistência, executar `runSyntheticStorageSmokeTest()`, que faz upload, leitura/verificação de integridade byte a byte e remoção exclusiva de um único objeto sintético no prefixo `__stage_storage_smoke_test__/lp_asset/<yyyy-mm>/smoke-probe-*.html`.

### 3.12 Política de Fallback de LPs (`LP_FALLBACK_ENABLED=false`) e Reassociação de Links Históricos
- **Desativação Operacional de `.lp.stage.consult` com `LP_FALLBACK_ENABLED=false`**:
  - **Listagem de domínios (`listTenantDomains` / `GET /api/domains` em [`sistema/src/lib/domains.ts`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/src/lib/domains.ts#L868-L923))**: retorna `fallbackDomain: null`, `lpFallbackEnabled: false`, `fallbackStatus: "disabled"` e `fallbackMessage` informando explicitamente que o fallback está desativado.
  - **Resolução de Host (`getDomainMapping` em [`sistema/src/lib/redis.ts`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/src/lib/redis.ts#L98-L216))**: recusa `*.lp.stage.consult`, `*.localhost` e o IP/host do painel (`172.212.145.134`), aceitando apenas `CustomDomain` com `dnsStatus === VERIFIED` e tenant ativo.
  - **Publicação de LP (`POST /api/lp/[slug]/publicar` em [`sistema/src/app/api/lp/[slug]/publicar/route.ts`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/src/app/api/lp/%5Bslug%5D/publicar/route.ts#L55-L103) e `atualizarLP` em [`sistema/src/lib/lp.ts`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/src/lib/lp.ts#L305-L348))**:
    - Sem domínio próprio selecionado (ou com domínio não verificado), impede a publicação antes de qualquer upload/atualização com código `CUSTOM_DOMAIN_REQUIRED` ou `DOMAIN_NOT_VERIFIED` e mensagem útil.
    - Nunca gera URL falsa (`*.lp.stage.consult` ou `http://172.212.145.134/<slug>`).
- **Preservação do Preview Autenticado e Identificação do Painel**:
  - `GET /api/lp-preview/[slug]` continua operacional para visualização autenticada do rascunho no editor, enquanto `http://172.212.145.134/<slug>` permanece no fluxo autenticado do painel SaaS.
- **Identificação Não-Destrutiva e Reassociação Explícita de Links Históricos**:
  - Links históricos em `briefingData.urlPublicada` não são sobrescritos automaticamente no banco; `findAffectedFallbackLandingPages()` lista as LPs afetadas em `GET /api/domains` (`affectedLandingPages`) e `lerLP` sinaliza `requiresDomainReassociation: true`.
  - `reassociateLandingPageDomain()` (`POST /api/domains` com `action: "reassociate"`) permite reassociar explicitamente uma LP afetada a um domínio próprio `VERIFIED`.
- **Fallback Configurável sem Valores Fictícios (`resolveTenantFallbackDomain` em [`sistema/src/lib/config.ts`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/src/lib/config.ts#L422-L441))**:
  - Caso `LP_FALLBACK_ENABLED=true` seja habilitado em outro ambiente, suporta `LP_FALLBACK_BASE_DOMAIN` exigindo `tenantSlug` real válido (sem placeholders fixos como `"cliente.lp.stage.consult"`).

---

## 4. Evidências Levantadas e Estado Atual dos Componentes

| Arquivo | Estado Atual | Observação / Próximos Passos |
|---|---|---|
| `sistema/src/lib/config.ts`, `sistema/src/proxy.ts` e `sistema/src/app/api/health/route.ts` | ✅ **Atualizados (Tarefas 02, 04, 05, Ask Caddy, Alvo TLS, Healthcheck e Fallback)**: Configuração runtime, leitura segura de `Host`, roteamento Painel vs LP, exceção exata para `GET /api/internal/caddy/allow`, `resolveCaddyTlsProbeTarget`, `/api/health` e `resolveTenantFallbackDomain`. | Concluídos e validados localmente. |
| `sistema/src/lib/auth.ts`, `api/login/route.ts`, `api/auth/switch-tenant/route.ts` | ✅ **Atualizados (Tarefa 03)**: Política unificada de cookies de sessão HTTP/HTTPS. | Validados localmente; teste em navegador na VM pendente. |
| `sistema/src/lib/domains.ts`, `sistema/src/lib/redis.ts`, `sistema/src/worker/index.ts`, `sistema/prisma/schema.prisma`, `sistema/src/app/api/domains/route.ts` e `sistema/src/app/api/internal/caddy/allow/route.ts` | ✅ **Atualizados até Desativação de Fallback e Reassociação**: Entrada canônica, PSL + zonas delegadas, contrato `direct-ip` (`A` + `TXT`), `verifyCustomDomain`, agendamento com backoff, endpoint `GET /api/internal/caddy/allow`, reconciliação TLS (`reconcileCaddyDomainTls`), bloqueio de fallback em `getDomainMapping` e `findAffectedFallbackLandingPages` / `reassociateLandingPageDomain`. | Apresentação completa de UI nas tarefas 22/23. |
| `sistema/src/lib/storage.ts`, `sistema/src/app/api/lp/[slug]/publicar/route.ts`, `sistema/src/lib/lp.ts`, `sistema/src/lib/ads.ts`, `sistema/src/app/lp-public/[host]/[slug]/route.ts`, `sistema/src/app/api/media/route.ts` e `sistema/src/app/api/media/[id]/route.ts` | ✅ **Atualizados no Storage e Publicação sem Fallback**: Validação do Azure Blob Storage, proteção contra referência inválida, bloqueio de publicação pública sem domínio próprio `VERIFIED` quando `LP_FALLBACK_ENABLED=false` e preservação do preview autenticado (`/api/lp-preview/[slug]`). | Concluídos e validados localmente. |
| `sistema/Caddyfile`, `sistema/Caddyfile.systemd`, `sistema/docker-compose.yml` e `sistema/docker-compose.systemd-caddy.yml` | ✅ **Preparados e Validados Localmente**: HTTP por IP do painel, HTTPS On-Demand TLS com `ask`, bloqueio público de `/api/internal*`, higienização de headers, `flush_interval -1`, privacidade da porta `3000` e variantes separadas (Compose vs `systemd`) fixadas em `Caddy v2.9.1`. | Não aplicados na VM ainda; decisão entre Variante A (Compose) e Variante B (`systemd`) pendente de confirmação na VM. |

---

## 5. Bloqueios e Pendências

- **Bloqueio 1 — Sem acesso direto à VM (`172.212.145.134`)**: O ambiente atual não possui conectividade/credenciais SSH para inspecionar processos ou aplicar configurações diretamente na VM `Stage-hub-mkt-dev`.
- **Pendência 1 — Domínio real de cliente**: **[PENDENTE]** Ainda desconhecido qual domínio ou subdomínio real será utilizado para o teste de apontamento DNS (`A`) para `172.212.145.134` e emissão real de certificado HTTPS no Caddy.
- **Pendência 2 — Modo de execução do Caddy na VM**: **[PENDENTE]** Ainda desconhecido se o Caddy em execução na VM `Stage-hub-mkt-dev` roda em container Docker (`docker-compose.yml` na rede interna com `web:3000`) ou como serviço nativo `systemd` no Ubuntu 22.04 (fazendo proxy para `127.0.0.1:3000` ou `127.0.0.1:3100`).
- **Pendência 3 — Teste de sessão em navegador/ambiente real na VM**: **[PENDENTE]** Aguarda acesso ao ambiente.
- **Status de Validação DNS/SSL**: **NÃO APROVADO / PENDENTE DE EVIDÊNCIA REAL NA VM** (nenhum domínio real teve DNS ou SSL marcado como aprovado; apenas testes locais com fixtures sintéticas foram executados).

---

## 6. Histórico de Tarefas

| Etapa | Descrição | Status |
|---|---|---|
| **Tarefa 01 (Preparação)** | Leitura de `AGENTS.md` e docs, conferência de branch/commit (`master` @ `e427e89`), diagnóstico dos arquivos de domínio, proxy, publicação, storage e Caddy, e criação de `docs/DOMAINS-VM-PROGRESS.md`. | ✅ Concluída localmente |
| **Tarefa 02 (Ambiente & Identificação do Painel)** | Configuração server-side validada em runtime, leitura centralizada de `Host` sem confiar em `x-azure-fdid`, higienização de cabeçalhos internos, atualização de `src/proxy.ts` e `.env.example`. | ✅ Concluída e validada localmente |
| **Tarefa 03 (Cookies de Sessão HTTP/HTTPS)** | Ajuste de `src/lib/auth.ts` e pontos de criação, renovação e logout (`api/login`, `api/auth/switch-tenant`), exigindo `Secure` em HTTPS e por padrão em produção, permitindo `COOKIE_SECURE=0` quando `APP_BASE_URL` usa HTTP por IP/loopback. | ✅ Concluída localmente |
| **Tarefa 04 (Entrada Canônica de Hostnames, PSL & Cadastro de Domínios)** | Normalização canônica (maiúsculas, ponto final DNS, IDN Punycode), rejeição de entradas inválidas, resolução PSL com suporte a zonas delegadas e proteção de unicidade global/tenant sob concorrência. | ✅ Concluída e validada localmente |
| **Tarefa 05 (Contrato e Instruções DNS `direct-ip` vs `cname`)** | Geração de instruções `A` (`DOMAIN_TARGET_IPV4`) + `TXT` (token exclusivo) com `fqdn` completo no modo `direct-ip` (para raiz, subdomínio, zona delegada e cadastros antigos sem limpar dados), proibição de IP em `CNAME_TARGET` e separação entre roteamento DNS e provedor TLS. | ✅ Concluída e validada localmente |
| **Tarefa 06 (Verificação DNS no Modo `direct-ip` em `verifyCustomDomain`)** | Exigência simultânea de `A` (`172.212.145.134`) + `TXT` (token exclusivo) para raiz e subdomínio, detecção de múltiplos `A` conflitantes e `AAAA` incompatível, diferenciação entre ausência de registro (`ENODATA`/`ENOTFOUND`), propagação parcial, timeout e erro transitório do resolvedor, sem chamar Azure Front Door no modo Caddy e encaminhando TLS para `PROVISIONING` (preservando `ACTIVE` em rechecagens). | ✅ Concluída e validada localmente |
| **Tarefa 07 (Agendamento de Domínios no Worker, Backoff, Concorrência e Revalidação)** | Retentativas com backoff limitado para propagação/falha DNS e TLS pendente/provisionando/recuperável (`nextCheckAt`, `checkAttempts`, `consecutiveFailures`, `lastReasonCode`, `lastError`), ordenação justa anti-starvation, lease de concorrência entre ciclos/instâncias sem transação de banco aberta durante DNS, rechecagem manual com rate limit e revalidação periódica de domínios ativos (preservando `VERIFIED`/`ACTIVE` em timeout transitório e revogando + invalidando cache em mudança confirmada de propriedade/destino). | ✅ Concluída e validada localmente |
| **Endpoint `GET /api/internal/caddy/allow` & Passagem Interna no Proxy** | Implementação de `GET /api/internal/caddy/allow?domain=HOST` (consulta curta, indexada e somente-leitura exigindo hostname canônico não reservado, `tenant.isActive` e `dnsStatus === VERIFIED` conforme política de validade, sem exigir `sslStatus === ACTIVE` nem LP publicada, e fail-closed em falha de banco) + exceção exata em `src/proxy.ts` e documentação do contrato de proteção de rede para a Tarefa 08. | ✅ Concluída e validada localmente |
| **Preparação do `Caddyfile` e Isolamento de Rede do Deployment** | Configuração de HTTP para o IP do painel e HTTPS com On-Demand TLS (`ask`) para domínios de clientes, bloqueio público de `/api/internal` e `/api/internal/*` antes do `reverse_proxy`, preservação de `Host` e streaming (`flush_interval -1`), remoção de headers internos forjados, API administrativa privada (`127.0.0.1:2019`), versão fixada (`caddy:2.9.1-alpine`) e variantes separadas para Compose (`web:3000` sem portas públicas) e `systemd` (`127.0.0.1:3000:3000` sem segundo Caddy), validadas em instância isolada do Caddy `v2.9.1`. | ✅ Concluída e validada localmente |
| **Reconciliação de Certificado TLS do Provedor Caddy** | Implementação de `reconcileCaddyDomainTls` e integração no worker após `DNS VERIFIED` persistido: handshake TLS controlado ao destino aprovado (`caddy:443` / `127.0.0.1:443`) com SNI do domínio do cliente, validação de cadeia confiável, hostname e validade temporal, aceitação de `HTTP 404` antes da primeira LP publicada (sem ciclo publicar/emitir), manutenção de `PROVISIONING` com retentativas em timeout inicial, registro de diagnóstico em falhas e revalidação periódica sem emissões desnecessárias. | ✅ Concluída e validada localmente |
| **Correção do Healthcheck (`/api/health`) & Compose** | Criação de `GET / HEAD /api/health` sem cookie (distinguindo `live`, `initializing` durante migrations e `unavailable` em falha de banco, sem expor versões/segredos), exceção exata em `src/proxy.ts` mantendo `/api/status` e `/api/internal/*` protegidos, e atualização do healthcheck em `docker-compose.yml` e `docker-compose.systemd-caddy.yml` (`Host: 127.0.0.1:3000`). | ✅ Concluída e validada localmente |
| **Caminho de Storage para Publicação e Mídia (Azure Blob Storage)** | Validação estrita de `AZURE_STORAGE_CONNECTION_STRING` e `AZURE_STORAGE_CONTAINER_NAME` sem exibir valores e sem fallback em disco, preservação de container privado e prefixos por tenant com leitura mediada pelo backend, garantia de que falha de upload não produz publicação/registro com referência inválida, documentação em `DEPLOY.md` e execução bem-sucedida do teste sintético real no Azure Blob Storage (`__stage_storage_smoke_test__`) com limpeza do objeto. | ✅ Concluída e validada (local + Azure Blob real) |
| **Correção do Fallback de LPs (`.lp.stage.consult`) com `LP_FALLBACK_ENABLED=false`** | Bloqueio operacional de `.lp.stage.consult` na listagem (`fallbackDomain: null`, `fallbackStatus: "disabled"`), na resolução de Host (`getDomainMapping`) e na publicação (`CUSTOM_DOMAIN_REQUIRED` / `DOMAIN_NOT_VERIFIED` sem gerar URL falsa), preservação do preview autenticado (`/api/lp-preview/[slug]`) e do IP exclusivo do painel, identificação não-destrutiva de LPs históricas afetadas e reassociação explícita (`reassociateLandingPageDomain`). | ✅ Concluída e validada localmente |
| **Próxima Tarefa** | Aguardando instrução da próxima tarefa da sequência (ex.: atualização da interface de domínios/publicação ou próximas etapas planejadas). | ⏳ Aguardando comando |
