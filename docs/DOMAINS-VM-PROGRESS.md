> Histórico anterior. A fonte canônica das correções de hosting de 18/11/2026 é [LP-HOSTING-AUDIT-FIXES](LP-HOSTING-AUDIT-FIXES.md). Relatos antigos não comprovam o estado atual de DNS/VM.

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

### 3.13 Fluxo de Publicação de LP (`POST /api/lp/[slug]/publicar`) com Rechecagem Pós-Upload e Limpeza Segura de Órfãos
- **Pré-condições Estritas de Autorização, Tenant, DNS e TLS ([`sistema/src/app/api/lp/[slug]/publicar/route.ts`](file:///c:/Users/Anderson/Documents/DarkLabs/Stage/sistema/src/app/api/lp/%5Bslug%5D/publicar/route.ts#L25-L267))**:
  - Exige sessão autorizada com permissão de edição (`exigirEditor()` -> `401` sem sessão ou com tenant inativo na sessão; `403` para `VIEWER`), LP e domínio pertencentes ao **mesmo tenant** (`403 DOMAIN_NOT_AUTHORIZED` / `DOMAIN_TENANT_MISMATCH`), **tenant ativo** (`lpRow.tenant.isActive === true` -> `403 TENANT_INACTIVE`), **`dnsStatus === VERIFIED`** (`400 DNS_NOT_VERIFIED`, `category: "dns"`) e **`sslStatus === ACTIVE`** (`400 SSL_NOT_ACTIVE`, `category: "tls"`).
  - Com fallback desligado (`LP_FALLBACK_ENABLED=false`), a seleção de um domínio próprio válido é obrigatória (`400 CUSTOM_DOMAIN_REQUIRED`, `category: "dns"`).
- **Geração de URL Canônica HTTPS**:
  - `validateDomainStateForPublish()` normaliza o hostname via `parseCustomDomainHostname()` e bloqueia qualquer tentativa de usar o endereço/IP do painel (`172.212.145.134`) ou `.lp.stage.consult` (`RESERVED_DOMAIN_FORBIDDEN`).
  - A URL publicada gerada é exclusivamente `https://<canonicalDomain>/<slug>`.
- **Distinção Clara de Erros (`category: "dns" | "tls" | "storage" | "auth" | "validation"`)**:
  - **DNS** (`category: "dns"`): `CUSTOM_DOMAIN_REQUIRED`, `DNS_NOT_VERIFIED`, `DOMAIN_REMOVED_DURING_PUBLISH`, `INVALID_DOMAIN_HOSTNAME`, `RESERVED_DOMAIN_FORBIDDEN`.
  - **TLS** (`category: "tls"`): `SSL_NOT_ACTIVE` (retorna `dnsStatus` e `sslStatus` atuais no payload).
  - **Storage** (`category: "storage"`): `STORAGE_UPLOAD_FAILED`, `STORAGE_CONFIG_ERROR`, `INVALID_UPLOAD_REFERENCE`.
- **Upload Fora de Transação, Rechecagem Atômica Pós-Upload e Limpeza Segura de Artefato Órfão ([`sistema/src/app/api/lp/[slug]/publicar/route.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/app/api/lp/%5Bslug%5D/publicar/route.ts))**:
  - `uploadTenantAsset()` é executado fora de qualquer transação de banco (`prisma.$transaction` não é utilizado durante I/O externo de rede/storage/Redis).
  - Após o upload concluir, a reconsulta (`recheckedDomain`, `recheckedTenant`, `recheckedLp`), a revalidação de `validateDomainStateForPublish()` e o `tx.landingPage.update()` executam em uma **transação curta e atômica** (`prisma.$transaction` com `Serializable`), eliminando a janela de corrida entre a rechecagem e a persistência final sob concorrência (remoção/invalidação de domínio, desativação de tenant ou remoção da LP).
  - Se a validação pós-upload falhar (`409` / `403`) ou se a transação lançar conflito/exceção (`P2034` / `P2003` -> `409 PUBLISH_CONFLICT`, ou `500 PUBLISH_PERSIST_FAILED`), a publicação anterior da LP é integralmente preservada e `cleanupOrphanUploadedAsset()` (fora da transação) remove com segurança apenas o novo blob órfão e seu registro `MediaAsset` (garantindo `uploadedBlobUrl !== previousPublishedBlobUrl`).
  - Validação defensiva de payload (`body.customDomainId` não-string rejeitado com `400 INVALID_CUSTOM_DOMAIN_ID`).
- **Evidência de Teste Focado e Reproduzível (Prompt 13)**:
  - Criado [`sistema/tests/lp-publicar.test.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/tests/lp-publicar.test.ts) (`npx tsx --test tests/lp-publicar.test.ts`, 10/10 casos passando com mocks locais de Prisma/Auth/Storage/Redis) cobrindo: publicação válida (`https://<domain>/<slug>` + invalidação de cache), domínio de outro tenant (`403`), ausência de domínio próprio (`400`), DNS pendente (`400`), TLS pendente (`400`), falha de upload (`503`), invalidação/remoção de domínio durante upload (`409` + limpeza de órfão), desativação de tenant durante upload (`403` + limpeza de órfão) e conflito `P2034` (`409` + limpeza de órfão). `npx tsc --noEmit` aprovado sem erros. (Não substitui testes reais em banco/Storage/VM.)
- **Pendência Registrada para Tarefa Curta Posterior (Caminhos Alternativos)**:
  - `atualizarLP` ([`sistema/src/lib/lp.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/lib/lp.ts#L295-L350)) e `reassociateLandingPageDomain` ([`sistema/src/lib/domains.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/lib/domains.ts#L813-L865)) validam `dnsStatus === VERIFIED`, mas ainda precisam ser avaliados quanto à exigência equivalente de `sslStatus === ACTIVE` ao publicar ou reassociar conteúdo já publicado.

### 3.14 Isolamento da Entrega Pública de LPs (`src/proxy.ts` e `src/app/lp-public/[host]/[slug]/route.ts`)
- **Bloqueio de Contorno Externo por `/lp-public/OUTRO_HOST/slug`**:
  - [`sistema/src/proxy.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/proxy.ts) removeu `/lp-public` de `ROTAS_PUBLICAS_PAINEL`, rejeita requisições externas para `/lp-public` e `/lp-public/*` com `404` (tanto em domínios públicos quanto no host do painel) e limpa qualquer cabeçalho `x-stage-lp-sig` enviado pelo cliente.
  - Nos rewrites internos legítimos de domínios públicos (`!isSaaSPanel`), `proxy.ts` gera assinatura HMAC-SHA256 (`signInternalLpRewrite(cleanHost, slug)` via Web Crypto com `JWT_SECRET`/`HUB_SECRET` ou segredo efêmero em memória no processo) no cabeçalho `x-stage-lp-sig` e preserva integralmente `search` (query strings), além de manter `/api/public/*` e `/api/media/*` liberados com cabeçalhos higienizados.
  - [`sistema/src/app/lp-public/[host]/[slug]/route.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/app/lp-public/%5Bhost%5D/%5Bslug%5D/route.ts) valida o `Host` confiável via `extractRequestHost(request)`, recusa host do painel ou divergência `reqHost.cleanHost !== host` e exige `verifyInternalLpRewrite()` válido (falhando fechado com `404`).
- **Isolamento por `tenantId` + `customDomainId` e Remoção do Fallback de Raiz**:
  - A busca da LP exige simultaneamente `tenantId: mapping.tenantId`, `customDomainId: mapping.customDomainId` (recusando `mapping` sem `customDomainId`), `slug` exato e `status: LPStatus.PUBLISHED`. Domínio desconhecido, inválido ou empresa inativa falha fechado (`404`).
  - Removido o fallback de raiz (`__root__` / `index`) para "última LP do tenant": até existir seleção explícita de página inicial (Prompts 15–16), a raiz (`/`) responde `404`.
- **Evidência de Teste Focado e Reproduzível (Prompt 14)**:
  - Criado [`sistema/tests/lp-public-isolation.test.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/tests/lp-public-isolation.test.ts) (`npx tsx --test tests/lp-public-isolation.test.ts`, 6/6 casos passando com mocks locais de Prisma/Redis/Storage) cobrindo: dois domínios do mesmo tenant e outro tenant, domínio desconhecido/empresa inativa (`404`), raiz (`/`) respondendo `404`, bloqueio externo de `/lp-public/*` em domínio público e no painel (`404`), rejeição de manipulação de `[host]` e headers forjados (`x-stage-lp-sig` / `x-forwarded-host`) e preservação de query strings e `/api/public/*` / `/api/media/*`. `npx tsc --noEmit` aprovado sem erros.

### 3.15 Associação Explícita da LP Inicial do Domínio (Prompts 15–16)
- **Schema & Migração Aditiva ([`sistema/prisma/schema.prisma`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/prisma/schema.prisma) & `20261118000000_custom_domain_home_lp`)**:
  - Adicionado `homeLandingPageId String? @unique` em `CustomDomain` com relação `homeLandingPage` (`onDelete: SetNull`), preservando `isDefault` (domínio padrão) e a unicidade `@@unique([tenantId, slug])` de `LandingPage`.
- **API & Autorização (`POST /api/domains` `action: "setHome"` em [`sistema/src/app/api/domains/route.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/app/api/domains/route.ts) & `setCustomDomainHomeLandingPage` em [`sistema/src/lib/domains.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/lib/domains.ts))**:
  - Exige sessão autorizada (`exigirEditor()`), domínio do mesmo tenant, LP do mesmo tenant e do mesmo `customDomainId`, e `status === LPStatus.PUBLISHED` com `publishedBlobUrl` válido (ou `landingPageId: null` para limpar). Invalida cache via `invalidateDomainMapping`.
- **Entrega na Raiz `/` e Limpeza Automática**:
  - Em [`sistema/src/app/lp-public/[host]/[slug]/route.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/app/lp-public/%5Bhost%5D/%5Bslug%5D/route.ts), a raiz (`/`, `__root__`) serve exclusivamente `homeLandingPage` se e somente se continuar pertencendo ao mesmo `tenantId` e `customDomainId` e estiver `PUBLISHED`; caso contrário, retorna `404` (sem escolher automaticamente a última LP publicada).
  - Ao despublicar (`DELETE /api/lp/[slug]/publicar`), mover de domínio (`POST /api/lp/[slug]/publicar`, `reassociateLandingPageDomain`, `atualizarLP`) ou remover a LP (`onDelete: SetNull`), `homeLandingPageId` é limpo sem afetar outras LPs.
- **Evidência de Teste Focado e Reproduzível (Prompts 15–16)**:
  - Criado [`sistema/tests/domain-home-lp.test.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/tests/domain-home-lp.test.ts) (`npx tsx --test tests/domain-home-lp.test.ts`, 6/6 casos passando com mocks locais) + suítes anteriores (`22/22` no total) e `npx tsc --noEmit` sem erros. UI pendente para etapas 22–23.

### 3.16 Integridade do Snapshot Publicado (Prompt 17)
- **Snapshot Imutável sem Reprocessamento de Marca na Leitura ([`sistema/src/app/lp-public/[host]/[slug]/route.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/app/lp-public/%5Bhost%5D/%5Bslug%5D/route.ts))**:
  - Confirmado que não há fallback para `htmlAutocontido` / `draftHtml` quando a leitura do Blob publicado falha (retorna `503` em indisponibilidade do storage e `404` quando o blob não existe, com `Cache-Control: no-store`).
  - Removida a chamada pós-leitura `resolveLpHtmlAssets(html, lp.tenantId)` da rota pública: os ativos da marca e mídias são congelados em Data URIs no momento da publicação (`htmlAutocontido(..., { embedAsDataUri: true })`), impedindo que alterações posteriores no rascunho ou no `BrandProfile` substituam silenciosamente conteúdo já publicado.
  - Preview autenticado (`/api/lp-preview/[slug]`) e preservação da última publicação válida durante falha de republicação mantidos intactos.
- **Evidência de Teste Focado e Reproduzível (Prompt 17)**:
  - Criado [`sistema/tests/lp-published-snapshot.test.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/tests/lp-published-snapshot.test.ts) (`npx tsx --test tests/lp-published-snapshot.test.ts`, passando com mocks locais; `23/23` no total) cobrindo: publicação A, edição de rascunho B sem republicar (continua servindo A sem chamar `resolveLpHtmlAssets`), falha de republicação preservando `publishedBlobUrl` de A, falha de leitura do Blob retornando `503` sem expor B, e republicação bem-sucedida passando a servir B. `npx tsc --noEmit` sem erros.

### 3.17 Isolamento da Rota Pública de Leads (`POST /api/public/leads` — Prompt 18)
- **Resolução Estrita pelo Host Confiável ([`sistema/src/app/api/public/leads/route.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/app/api/public/leads/route.ts))**:
  - Usa exclusivamente `extractRequestHost(request)` + `normalizeHostname()` e `getDomainMapping(trustedHost)`, recusando host inválido, host do painel (`isAppPanelHost`) ou domínio sem `customDomainId` (`404`).
  - `body.host` e `body.tenantId` nunca são usados como autoridade; removida qualquer busca global sem `tenantId`/`customDomainId`.
  - Exige identificação explícita da LP (`landingPageId` ou `slug` -> `400` se ausente) e filtra `prisma.landingPage.findFirst` estritamente por `tenantId: domainMap.tenantId`, `customDomainId: domainMap.customDomainId`, `status: LPStatus.PUBLISHED` e `tenant.isActive === true` (`404` caso contrário).
  - Preservados: `POST /api/public/leads` relativo sem cookie nem CORS aberto, captura de UTMs, validação de campos, honeypot (`_gotcha` / `honeypot` / `_stage_hp`), rate limit (`15 req/60s` por IP) e `enqueueLeadNotification()` sem alterar o mecanismo de e-mail.
- **Evidência de Teste Focado e Reproduzível (Prompt 18)**:
  - Criado [`sistema/tests/public-leads-isolation.test.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/tests/public-leads-isolation.test.ts) (`npx tsx --test tests/public-leads-isolation.test.ts`, 5/5 casos passando com mocks locais; `28/28` no total) cobrindo captura válida, host desconhecido/painel, `body.host`/`body.tenantId` falsificados, LP de outro domínio do mesmo tenant, LP de outro tenant, payload sem identificação de LP, honeypot e rate limit (comprovando ausência de gravação em todos os casos rejeitados). `npx tsc --noEmit` sem erros.

### 3.18 Isolamento de Mídia em LPs e `GET/HEAD /api/media/[id]` (Prompt 19)
- **Vínculo Mínimo de Assets ao Snapshot Publicado ([`sistema/prisma/schema.prisma`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/prisma/schema.prisma) & `20261118010000_lp_published_assets`)**:
  - Adicionado `publishedAssetIds String[] @default([])` em `LandingPage`, populado em `POST /api/lp/[slug]/publicar` ([`publicar/route.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/app/api/lp/%5Bslug%5D/publicar/route.ts)) com os IDs `/api/media/<id>` não-HTML pertencentes ao mesmo tenant referenciados no snapshot/OG image. Container Blob permanece privado e sem dependências de `http://172.212.145.134` em LP HTTPS.
- **Autorização em `GET` e `HEAD /api/media/[id]` ([`sistema/src/app/api/media/[id]/route.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/app/api/media/%5Bid%5D/route.ts))**:
  - **Snapshots HTML (`lp_asset` `text/html` / `.html`)**: bloqueio estrito contra acesso anônimo ou via URL assinada por esta rota (`403`), impedindo contorno de despublicação ou domínio.
  - **Categoria `lp_asset` ou `logo` isoladamente**: não torna o objeto público. Acesso anônimo exige `Host` confiável (`extractRequestHost` != painel) -> `getDomainMapping` -> LP `PUBLISHED` no mesmo `tenantId` + `customDomainId` contendo o `asset.id` em `publishedAssetIds` (`403` caso contrário).
  - **Acesso autenticado & URLs assinadas sociais**: preservado acesso autenticado do mesmo tenant (`usuarioAtual()` -> `401`/`403` fora do tenant) e suporte a URLs assinadas HMAC-SHA256 com expiração (`signMediaAssetPath` / `verifySignedMediaToken` em [`storage.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/lib/storage.ts), aplicado no worker [`worker/index.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/worker/index.ts) para publicação social).
  - Cabeçalhos `Cache-Control: private, max-age=300` (e `no-store` nas negações) + `Vary: Host, Cookie`.
- **Evidência de Teste Focado e Reproduzível (Prompt 19)**:
  - Criado [`sistema/tests/media-isolation.test.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/tests/media-isolation.test.ts) (`npx tsx --test tests/media-isolation.test.ts`, 5/5 casos passando com mocks locais; `33/33` nas 6 suítes) cobrindo `GET`/`HEAD` anônimo em LP publicada, bloqueio de `lp_asset` HTML e `logo` não vinculada, tentativa cruzada entre domínios/tenants, negação no painel sem sessão, acesso autenticado do tenant e URL assinada social válida/inválida. `npx tsc --noEmit` sem erros.

### 3.19 Consistência de Cache de Domínio e Cache HTTP (Prompt 20)
- **Eliminação de Cache em Memória por Processo para Autorização ([`sistema/src/lib/redis.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/lib/redis.ts))**:
  - `getDomainMapping()` deixou de gravar e ler `memoryCache` por processo: utiliza exclusivamente Redis compartilhado (TTL positivo limitado a `300s`, negativo `"__NULL__"` a `60s`) com fallback direto para PostgreSQL quando o Redis estiver indisponível — garantindo que invalidações feitas pelo `worker` sejam vistas imediatamente pelo `web` e que queda do Redis não sirva autorização obsoleta em memória.
  - Adicionado `invalidateTenantDomainMappings(tenantId)` para invalidar todos os domínios de um tenant.
- **Invalidação em Desativação/Reativação de Tenant ([`sistema/src/app/api/admin/tenants/route.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/app/api/admin/tenants/route.ts))**:
  - `PATCH /api/admin/tenants` passa a chamar `invalidateTenantDomainMappings(tenant.id)` sempre que `isActive` for alterado (somando-se às invalidações já presentes em publicação, reassociação, verificação e remoção de domínio).
- **Cache HTTP das LPs e Mídias**:
  - [`lp-public/[host]/[slug]/route.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/app/lp-public/%5Bhost%5D/%5Bslug%5D/route.ts): `Cache-Control: no-store, must-revalidate` + `Vary: Host` (substituindo `s-maxage=60, stale-while-revalidate=600`), garantindo rejeição imediata em novas requisições após despublicação.
  - [`api/media/[id]/route.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/app/api/media/%5Bid%5D/route.ts): `Cache-Control: private, no-cache, must-revalidate` + `Vary: Host, Cookie`.
- **Evidência de Teste Focado e Reproduzível (Prompt 20)**:
  - Criado [`sistema/tests/domain-cache-consistency.test.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/tests/domain-cache-consistency.test.ts) (`npx tsx --test tests/domain-cache-consistency.test.ts`, 4/4 casos passando simulando dois processos `web`/`worker` com Redis compartilhado e mocks de Prisma/Auth) cobrindo: domínio recém-verificado após cache negativo, remoção/revogação com cache positivo, desativação de tenant via `PATCH /api/admin/tenants` e Redis indisponível consultando PostgreSQL diretamente. `npx tsc --noEmit` sem erros.

### 3.20 Exclusão Segura de `CustomDomain` (Prompt 21)
- **Bloqueio de Exclusão com LP Publicada e Proteção Transacional ([`sistema/src/lib/domains.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/lib/domains.ts) & [`sistema/src/app/api/domains/route.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/app/api/domains/route.ts))**:
  - `deleteCustomDomain()` executa em `prisma.$transaction(..., { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })`:
    1. Confirma propriedade do domínio (`id` + `tenantId` -> `404` caso não exista ou pertença a outro tenant).
    2. Verifica dentro da transação se há qualquer `LandingPage` com `status: LPStatus.PUBLISHED` vinculada ao domínio; se houver, aborta com `DomainConflictError` (`409`) listando os slugs e orientando a despublicar ou reassociar antes de excluir (impedindo `onDelete: SetNull` silencioso).
    3. Sem LPs publicadas, limpa `customDomainId = null` nas LPs não publicadas (`DRAFT`/etc.) e `homeLandingPageId = null` antes de excluir o `CustomDomain`.
    4. Trata conflito de serialização `P2034` com publicação concorrente como `DomainConcurrencyError` (`409`).
    5. Após commit, chama `invalidateDomainMapping(deletedDomainHost)`, fazendo com que `GET /api/internal/caddy/allow` (`ask`) e `getDomainMapping` passem a negar o domínio imediatamente (`404`), mesmo se o certificado permanecer em disco no Caddy.
  - `DELETE /api/domains` preserva os códigos HTTP de `DomainConflictError` (`409`), `DomainConcurrencyError` (`409`) e `DomainValidationError` (`404`/`400`).
- **Evidência de Teste Focado e Reproduzível (Prompt 21)**:
  - Criado [`sistema/tests/domain-delete.test.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/tests/domain-delete.test.ts) (`npx tsx --test tests/domain-delete.test.ts`, 4/4 casos passando com mocks locais de Prisma/Auth/Redis) cobrindo: exclusão bloqueada (`409`) com LP publicada, exclusão bem-sucedida após despublicar + limpeza de rascunhos + invalidação de cache + bloqueio imediato no `ask` (`404`), negação para domínio de outro tenant (`404`) e proteção contra publicação concorrente (`409` / `P2034`). `npx tsc --noEmit` sem erros.

### 3.21 Interface `DomainSetupModal.tsx` para Modo VM (Prompt 22)
- **Instruções Reais de DNS (`A` + `TXT`) e Guias por Provedor ([`sistema/src/components/site/DomainSetupModal.tsx`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/components/site/DomainSetupModal.tsx))**:
  - No modo VM (`direct-ip`), `getProviderGuides()` exibe instruções reais com registro **`A`** apontando para `172.212.145.134` e **`TXT`** de propriedade para Registro.br, Cloudflare (`DNS only`), GoDaddy e HostGator/cPanel, aceitando domínio raiz (`@`) diretamente com `A` sem exigir `ALIAS/CNAME flattening`.
  - Tabela de registros DNS exibe nome relativo (`rec.host`), nome completo FQDN (`rec.fqdn`) e valor (`rec.value`), todos com cópia em 1 clique, explicando que o cliente altera no provedor autoritativo e depois solicita verificação, e que o `TXT` comprova propriedade (não é desafio ACME).
- **Estados Reais, Fallback Desligado e Cadastro Neutro**:
  - `describeDomainSetupState()` exibe propriedade/roteamento (`PENDING` / `FAILED` recuperável / `VERIFIED`), TLS (`Aguardando DNS` / `TLS em emissão` / `Falha recuperável no TLS` / `HTTPS ativo — Pronto`).
  - Removida exibição de "Subdomínio Gratuito / SSL Ativo" quando `lpFallbackEnabled === false` e ajustado o feedback de cadastro para estado informativo/pendente (`type: "info"`, sem sucesso prematuro ao apenas cadastrar). Idiomas (`useI18n`) e modal único preservados.
- **Evidência de Teste Focado e Reproduzível (Prompt 22)**:
  - Criado [`sistema/tests/domain-setup-modal.test.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/tests/domain-setup-modal.test.ts) (`npx tsx --test tests/domain-setup-modal.test.ts`, 3/3 casos passando) cobrindo guias de provedores `direct-ip`, registros `A` + `TXT` (relativo e FQDN) para raiz e subdomínio, e todos os estados reais (`dns_pending`, `dns_failed`, `tls_provisioning`, `tls_failed`, `ready`). `npx tsc --noEmit` sem erros.

### 3.22 Interface de Publicação e Seleção de Domínio em `LPDetalhe.tsx` (Prompt 23)
- **Prontidão Real e Bloqueio com Fallback Desligado ([`sistema/src/components/ads/LPDetalhe.tsx`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/components/ads/LPDetalhe.tsx) & [`domains.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/lib/domains.ts))**:
  - Com `lpFallbackEnabled === false`, `.lp.stage.consult` não é oferecido; cada domínio no seletor exibe a prontidão real (`evaluatePublishDomainReadiness`: `Pronto (DNS + HTTPS)` / `DNS ...` / `TLS ...`) e o botão de publicar é bloqueado com explicação clara quando o domínio não está apto (mantendo a validação obrigatória no backend).
  - Preserva `selectedDomainId` ao recarregar/publicar e exibe exclusivamente a URL canônica devolvida pelo servidor (`resolveCanonicalPublishedUrl`), nunca construindo URL falsa quando a LP não está publicada ou requer reassociação.
  - Erros de `dns`, `tls` e `storage` retornados pelo backend são exibidos com prefixo de categoria sem mascaramento como sucesso.
  - Integradas as ações de **despublicar** (`DELETE /api/lp/[slug]/publicar`), **reassociar** link histórico (`POST /api/domains` `action: "reassociate"`) e **definir/remover página inicial (`/`)** (`POST /api/domains` `action: "setHome"`, expondo `homeLandingPageId` em `serializeDomain`), preservando o preview autenticado (`/api/lp-preview/[slug]`) sem refatorar o editor de IA.
- **Evidência de Teste Focado e Reproduzível (Prompt 23)**:
  - Criado [`sistema/tests/lp-detalhe-publish.test.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/tests/lp-detalhe-publish.test.ts) (`npx tsx --test tests/lp-detalhe-publish.test.ts`, 3/3 casos passando) cobrindo ausência de domínio com fallback desligado, domínio com DNS/TLS pendente vs pronto e não construção de URL falsa em rascunho/reassociação. `npx tsc --noEmit` sem erros.

### 3.23 Notificação de Leads de LP (`email-service.ts` & Worker Polling — Prompt 24)
- **Validação Estrita, Idempotência e Ausência de Sucesso Falso ([`sistema/src/lib/email-service.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/lib/email-service.ts))**:
  - `sendLeadNotificationEmail()` agora exige `RESEND_MASTER_API_KEY` (não marca mais `"sent_custom"`/`"sent_fallback"` localmente quando a chave falta — marca `"failed"` preservando o lead), exige destinatários válidos e exige remetente autorizado (custom verified com `senderDomain` compatível ou `STAGE_FALLBACK_FROM_EMAIL` explicitamente configurado, sem usar `leads@stage.consult` como fallback operacional implícito).
  - Adicionada guarda de idempotência + claim atômico (`emailDeliveryStatus: { in: ["queued", "failed"] }` -> `"sending"`) para evitar envios duplicados em reentrega do Service Bus ou polling repetido.
  - Diferenciadas explicitamente as mensagens de diagnóstico de DNS de remetente (SPF/DKIM na Resend) dos registros `A`/`TXT` da LP.
  - `enqueueLeadNotification()` trata falha eventual do Service Bus sem derrubar a captura do lead, mantendo o registro durável (`"queued"`) no PostgreSQL.
- **Polling de Leads no Worker ([`sistema/src/worker/index.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/worker/index.ts))**:
  - Adicionado `processPendingLeadNotifications()` em `runPeriodicJobs()` para processar leads com `emailDeliveryStatus === "queued"` mesmo sem Service Bus configurado.
- **Evidência de Teste Focado e Reproduzível (Prompt 24)**:
  - Criado [`sistema/tests/lead-email-notification.test.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/tests/lead-email-notification.test.ts) (`npx tsx --test tests/lead-email-notification.test.ts`, 5/5 casos passando com transporte simulado e mocks de Prisma) cobrindo captura persistida + envio + idempotência, ausência de `RESEND_MASTER_API_KEY` sem sucesso falso, bloqueio de `leads@stage.consult` sem configuração explícita, falha do provedor preservando o lead e modo sem Service Bus via `processPendingLeadNotifications()`. `npx tsc --noEmit` sem erros. (Envio externo real reservado à etapa final.)

### 3.24 Preparação de Release Local, Migrations, Build & Checklist de Implantação (Prompts 25–26)
- **Revisão e Teste das Migrations em Base Descartável (`@electric-sql/pglite` em memória)**:
  - Todas as migrations da sequência são estritamente aditivas e idempotentes (`IF NOT EXISTS`):
    1. `20261117000000_custom_domain_scheduling` (campos de agendamento/diagnóstico/lease e índices em `CustomDomain`).
    2. `20261118000000_custom_domain_home_lp` (`homeLandingPageId` nullable + índice único + FK `ON DELETE SET NULL`).
    3. `20261118010000_lp_published_assets` (`publishedAssetIds` `TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]` em `LandingPage`).
  - Testadas em PostgreSQL descartável em memória (schema anterior `init` + `scheduling` populado com dados sintéticos de tenants, domínios, tokens e LPs, aplicando as duas novas migrations duas vezes): domínios, tokens, vínculos e `briefingData` preservados 100%, índice único e `ON DELETE SET NULL` comprovados. `npx prisma validate` aprovado.
- **Typecheck, Build e Suíte Focada**:
  - Corrigida regressão de build introduzida por esta sequência em [`api/health/route.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/app/api/health/route.ts) e [`api/internal/caddy/allow/route.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/app/api/internal/caddy/allow/route.ts): removida a diretiva `export const dynamic = "force-dynamic"` incompatível com `cacheComponents: true` em `next.config.ts` (Next.js 16.4 mantém rotas com parâmetro `request: Request` como dinâmicas em tempo de requisição).
  - `npx tsc --noEmit`: **0 erros**.
  - `npx tsx --test` nas 11 suítes (`lp-publicar`, `lp-public-isolation`, `domain-home-lp`, `lp-published-snapshot`, `public-leads-isolation`, `media-isolation`, `domain-cache-consistency`, `domain-delete`, `domain-setup-modal`, `lp-detalhe-publish`, `lead-email-notification`): **52/52 casos passando** (mocks locais).
  - `npm run build` (`next build` 16.4.0 Turbopack): **concluído com sucesso** (exit code 0, 51/51 rotas geradas). *(Nota: Next.js exibiu aviso de vulnerabilidade conhecida na versão 16.4.0 recomendando upgrade, fora do escopo desta etapa.)*
- **Checklist de Implantação na VM (`Stage-hub-mkt-dev` — NÃO EXECUTAR AGORA)**:
  1. **Backup prévio obrigatório (antes de qualquer migration ou troca de container)**:
     - Backup lógico do PostgreSQL (`pg_dump -Fc "$DATABASE_URL" > backup_pre_release_$(date +%F_%H%M).dump`).
     - Cópia de `.env`, `Caddyfile` / `Caddyfile.systemd` e arquivos Compose em uso.
     - Cópia do volume/diretório de certificados do Caddy (`caddy-data` no Compose ou `/var/lib/caddy/.local/share/caddy` no `systemd`).
  2. **Variáveis obrigatórias no `.env` da VM**:
     - Runtime & Painel: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `HUB_SECRET`, `HUB_PASSWORD`, `SOCIAL_TOKEN_SECRET`, `APP_PANEL_HOST="172.212.145.134"`, `APP_BASE_URL="http://172.212.145.134"`, `COOKIE_SECURE="0"` (exceção HTTP por IP), `TRUSTED_PROXY="1"`.
     - Domínios & Caddy: `DOMAIN_ROUTING_MODE="direct-ip"`, `DOMAIN_TARGET_IPV4="172.212.145.134"`, `DOMAIN_TLS_PROVIDER="caddy"`, `LP_FALLBACK_ENABLED="false"`, `CADDY_TLS_PROBE_HOST` (`"caddy"` no Compose ou `"127.0.0.1"` no `systemd`), `CADDY_TLS_PROBE_PORT="443"`.
     - Storage, E-mail & IA: `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER_NAME`, `RESEND_MASTER_API_KEY`, opcional `STAGE_FALLBACK_FROM_EMAIL` (se houver identidade autorizada na Resend), opcional `AZURE_SERVICE_BUS_CONNECTION_STRING` (polling do worker funciona sem ele), `ANTHROPIC_API_KEY`.
  3. **Ordem de execução (proibido `prisma migrate reset`, `db push --force-reset` ou `docker compose down -v`)**:
     - Conferir `npx prisma migrate status` e aplicar `npx prisma migrate deploy`.
     - Subir/atualizar `web` e confirmar `GET /api/health` (`Host: 127.0.0.1:3000`) -> HTTP `200` (`ready: true`).
     - Subir/atualizar `worker` (após `web` healthy).
     - Validar e recarregar o Caddy apenas na variante ativa (**Variante A** `docker-compose.yml` + `Caddyfile` com `systemd` caddy parado, OU **Variante B** `docker-compose.systemd-caddy.yml` + `/etc/caddy/Caddyfile` via `systemd` sem segundo Caddy).
  4. **Política de Rollback Compatível com o Schema**:
     - Como as migrations são aditivas (`homeLandingPageId` nullable e `publishedAssetIds` com default `[]`), eventual rollback de aplicação só pode voltar para versão/imagem **compatível com o schema já migrado**.
     - **PROIBIDO voltar binário/imagem incompatível com a migração aplicada** (ex.: build que falhe com as novas colunas ou código legado sem os novos bloqueios de isolamento sem restaurar o backup). Caso seja indispensável reverter o schema, restaurar o backup `pg_dump` pré-deploy em janela controlada (nunca rodar `DROP COLUMN` ad-hoc ou `down -v`).

### 3.25 Implantação na VM `Stage-hub-mkt-dev` (`172.212.145.134`) — **DEPLOY NÃO EXECUTADO**
- **Motivo do bloqueio**:
  1. **Sem acesso SSH/CLI à VM**: `Test-NetConnection 172.212.145.134 -Port 22` falhou/sem resposta, `az` CLI ausente e `~/.ssh/config` sem host/usuário/chave para `Stage-hub-mkt-dev`. (Apenas porta `80/TCP` respondeu no teste de conectividade.)
  2. **Modo Caddy na VM ainda não confirmado**: indefinido se a VM executa **Variante A** (Caddy no Docker Compose) ou **Variante B** (Caddy nativo via `systemd`).
  3. **Autorização de janela de manutenção**: pendente confirmação para aplicar alterações e migrations no ambiente remoto.
- **Comandos Exatos de Implantação (executar na VM via SSH após confirmar acesso e modo Caddy)**:
  1. **Inspeção inicial (antes de modificar qualquer arquivo)**:
     ```bash
     cd /srv/stage-hub/sistema   # ou diretório equivalente da aplicação na VM
     git rev-parse HEAD && git status --short
     ss -tulpn | grep -E ':80|:443|:3000|:3100'
     systemctl is-active caddy 2>/dev/null || true
     docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
     ```
  2. **Backup prévio obrigatório (preservando `.env`, volumes, banco, blobs e certificados)**:
     ```bash
     mkdir -p ~/stage-backups/$(date +%F_%H%M)
     BACKUP_DIR=~/stage-backups/$(date +%F_%H%M)
     cp .env "$BACKUP_DIR/.env.bak"
     cp Caddyfile Caddyfile.systemd docker-compose.yml docker-compose.systemd-caddy.yml "$BACKUP_DIR/" 2>/dev/null || true
     # Banco PostgreSQL (usando DATABASE_URL do .env sem expor no log):
     set -a && source .env && set +a
     pg_dump -Fc "$DATABASE_URL" > "$BACKUP_DIR/postgres_pre_deploy.dump"
     # Certificados Caddy (escolha conforme o modo ativo):
     # Variante A (Compose): docker run --rm -v sistema_caddy-data:/data -v "$BACKUP_DIR":/bak alpine tar czf /bak/caddy-data.tgz -C /data .
     # Variante B (systemd): sudo tar czf "$BACKUP_DIR/caddy-systemd-data.tgz" -C /var/lib/caddy/.local/share/caddy .
     ```
  3. **Atualização do código e migrations (sem `reset`, sem `db push --force-reset`, sem `down -v`)**:
     ```bash
     git pull origin master
     npx prisma migrate status
     npx prisma migrate deploy
     ```
  4. **Subida de `web` + `worker` + Caddy (escolher APENAS UMA variante para não disputar 80/443)**:
     - **Variante A (Caddy no Docker Compose — exige `sudo systemctl disable --now caddy` se houver Caddy nativo)**:
       ```bash
       docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2.9.1-alpine caddy validate --config /etc/caddy/Caddyfile
       docker compose -f docker-compose.yml up -d --build postgres redis web
       docker compose -f docker-compose.yml ps
       docker compose -f docker-compose.yml up -d --build worker caddy
       ```
     - **Variante B (Caddy nativo via `systemd`)**:
       ```bash
       sudo cp Caddyfile.systemd /etc/caddy/Caddyfile
       sudo caddy validate --config /etc/caddy/Caddyfile
       docker compose -f docker-compose.systemd-caddy.yml up -d --build postgres redis web
       docker compose -f docker-compose.systemd-caddy.yml up -d --build worker
       sudo systemctl reload caddy
       ```
  5. **Conferência de rede, firewall (UFW/NSG) e backend privado (sem alterar regras de SSH)**:
     ```bash
     sudo ufw status verbose
     ss -tulpn | grep -E ':80|:443|:3000|:3100|:2019'
     # Esperado: apenas 80/443 públicos; 3000 apenas em loopback/rede interna; 2019 apenas 127.0.0.1
     curl -fsS -H 'Host: 127.0.0.1:3000' http://127.0.0.1:3000/api/health
     # Teste externo de bloqueio de /api/internal*: deve retornar 403
     curl -i http://172.212.145.134/api/internal/caddy/allow?domain=teste.com
     ```
  6. **Smoke check do painel em HTTP pelo IP e rollback compatível com schema**:
     - Acessar `http://172.212.145.134/login`, validar login/cookie de sessão (`COOKIE_SECURE=0`) e logout.
     - **Em caso de falha no deploy**: não rodar `docker compose down -v`. Voltar apenas imagem/commit compatível com o schema migrado (ou restaurar `pg_dump` antes de voltar código anterior).
- **Status DNS/SSL dos clientes**: não validado nem aprovado nesta etapa (reservado aos Prompts 27–30).

### 3.26 Cadastro e Preparação/Conferência de DNS Real (`lp.garapalabs.com`)
- **Cadastro existente conferido no PostgreSQL (tenant `Stage Consulting` — `2dcf2ad2-454d-4888-910a-76f32c3523fa`)**:
  - `CustomDomain.id`: `22c82c33-04ba-4b49-bab5-9f34a9f9dee6`
  - `domain`: `lp.garapalabs.com` (`isSubdomain: true`, `dnsProviderHint: "GoDaddy"`)
  - `verificationToken` (gerado pelo app): `stage-verify-17064e4734f8d480b26462d0`
  - Estado atual preservado (sem forçar `VERIFIED`): `dnsStatus = FAILED`, `sslStatus = PENDING` (aguardando criação/propagação dos registros DNS no provedor autoritativo).
- **Conferência de Nameservers Autoritativos & Zona (`garapalabs.com`)**:
  - Nameservers autoritativos: `ns37.domaincontrol.com` e `ns38.domaincontrol.com` (GoDaddy, SOA serial `2026111600`).
  - Sem wildcard em `*.garapalabs.com` e sem conflitos de `A`, `AAAA` ou `CNAME` em `lp.garapalabs.com` (`ENOTFOUND` tanto na consulta pública quanto nos NS autoritativos).
  - Sem acesso/credenciais da API GoDaddy neste ambiente — registros abaixo devem ser adicionados pelo operador na zona `garapalabs.com` preservando `MX`/`SPF`/`DKIM` e outros hosts (sem alterar raiz/@ nem `www` nem criar wildcard):
    1. **Tipo `A`** | **Nome (GoDaddy relativo à zona)**: `lp` *(FQDN `lp.garapalabs.com`)* | **Valor**: `172.212.145.134` | **TTL**: `600` (ou padrão)
    2. **Tipo `TXT`** | **Nome (GoDaddy relativo à zona)**: `_stage-verify.lp` *(FQDN `_stage-verify.lp.garapalabs.com`)* | **Valor**: `stage-verify-17064e4734f8d480b26462d0` | **TTL**: `600` (ou padrão)

### 3.27 Validação Real de Provisionamento TLS (`lp.garapalabs.com`) — **BLOQUEADA / NÃO APROVADA**
Diagnóstico real executado em **2026-11-18** sem editar estados no banco e sem `curl -k`/`ignoreHTTPSErrors`:
- **Camada DNS (`garapalabs.com` / `lp.garapalabs.com`)**:
  - `A` (`lp.garapalabs.com`): `ENOTFOUND`; `TXT` (`_stage-verify.lp.garapalabs.com`): `ENOTFOUND` (registros ainda não adicionados pelo operador na GoDaddy).
  - `AAAA`: `ENOTFOUND` (sem conflito IPv6); `CAA` (`garapalabs.com`): `ENODATA` (sem restrição CAA).
  - Estado no PostgreSQL mantido sem alteração: `dnsStatus = FAILED`, `sslStatus = PENDING`.
- **Camada NSG / UFW (`172.212.145.134`)**:
  - Portas `80/TCP` e `443/TCP` abertas e acessíveis externamente (`TcpTestSucceeded: True`).
- **Camada Caddy + Backend + Endpoint `ask` na VM (evidência de versão antiga implantada)**:
  - `GET http://172.212.145.134/api/internal/caddy/allow?domain=lp.garapalabs.com` retornou `401 Unauthorized` (`{"error":"não autenticado"}`, com `Via: 1.1 Caddy`) vindo do Next.js — comprovando que o `Caddyfile` ativo na VM **ainda não** aplica o bloqueio de borda `403` para `/api/internal/*` e que o `web`/`proxy.ts` ativo na VM **ainda não** recebeu o deploy novo (`deploy não executado` no Prompt 26).
  - `GET http://172.212.145.134/api/health` também retornou `401 Unauthorized` (versão anterior ao novo endpoint `/api/health`).
  - `GET http://172.212.145.134/` com `Host: lp.garapalabs.com` retornou `404` HTML direto em HTTP sem redirecionamento `HTTP -> HTTPS`.
- **Camada TLS (`172.212.145.134:443` com SNI `lp.garapalabs.com`)**:
  - Handshake TLS via `node:tls` (validação estrita) falhou com `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` (`SSL alert number 80`), consistente com ausência de DNS apontado + ausência de `ask`/`Caddyfile` atualizados na VM.
- **Impedimento exato para concluir esta etapa**:
  1. Operador adicionar `A` (`lp` -> `172.212.145.134`) e `TXT` (`_stage-verify.lp` -> `stage-verify-17064e4734f8d480b26462d0`) na GoDaddy.
  2. Executar o deploy pendente na VM `Stage-hub-mkt-dev` (Prompt 26, seção 3.25) atualizando migrations, `web`, `worker` e `Caddyfile`.
  3. Somente após (1) e (2), repetir a observação real `DNS VERIFIED -> TLS PROVISIONING -> SSL ACTIVE` e validar `https://lp.garapalabs.com/` sem erros TLS e `403` externo em `/api/internal/caddy/allow`.

### 3.28 Primeiro Teste Completo com LP Sintética (Prompt 29) — **EXECUÇÃO REAL BLOQUEADA NA VM / E2E LOCAL VALIDADO**
- **Status do Teste Real em Produção/Homologação (`https://lp.garapalabs.com`)**: **NÃO EXECUTADO / BLOQUEADO** (sem destinatário de teste indicado para e-mail, `lp.garapalabs.com` com DNS `ENOTFOUND`/`FAILED` + TLS `PENDING`, e VM `172.212.145.134` aguardando deploy da seção 3.25 — comprovado em nova checagem onde `GET http://172.212.145.134/api/health` seguiu retornando `401`). Nenhum registro real foi criado no banco remoto para evitar lixo em produção.
- **Evidência E2E Local Reproduzível nos Handlers Reais ([`sistema/tests/e2e-synthetic-lp-flow.test.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/tests/e2e-synthetic-lp-flow.test.ts))**:
  - `npx tsx --test tests/e2e-synthetic-lp-flow.test.ts` (**1/1 passando**, mocks locais de Prisma/Redis/Storage/Auth):
    1. Publicação V1 no domínio pronto -> URL canônica `https://lp.garapalabs.com/lp-sintetica-teste`.
    2. Visita anônima em `/lp-sintetica-teste` e `/api/media/asset-hero-1` -> `200`, sem referências a `http://172.212.145.134`.
    3. Associação da LP como página inicial (`setHome`) -> raiz `/` serve V1 (`200`).
    4. Envio de formulário sintético em `POST /api/public/leads` -> lead gravado no tenant/LP corretos e processado por `processPendingLeadNotifications()` (entrega externa pendente sem destinatário/Resend real).
    5. Edição de rascunho V2 sem republicar -> `/lp-sintetica-teste` continua servindo V1.
    6. Republicação V2 -> pública atualiza para V2.
    7. Despublicação (`DELETE /api/lp/[slug]/publicar`) -> `/lp-sintetica-teste` e `/` retornam `404`, e `/api/media/asset-hero-1` retorna `403`.
  - *(Não substitui a abertura real em janela anônima HTTPS na VM após o desbloqueio das etapas 26–28.)*

### 3.29 Matriz Final de Verificação, Isolamento e Recuperação (Prompt 30)
> **Declaração explícita de status**: O fluxo real na VM `Stage-hub-mkt-dev` **NÃO está concluído** nesta data. Todas as regras de código, migrations, build e isolamento foram **aprovadas localmente**, enquanto deploy na VM, DNS `lp.garapalabs.com`, TLS real do Caddy, abertura HTTPS em navegador e envio externo de e-mail permanecem **bloqueados por acesso/configuração externa**.

| Cenário | Ambiente | Comando / Ação | Resultado | Evidência |
|---|---|---|---|---|
| **Publicação de LP (`POST /publicar`, TLS/DNS/storage, concorrência e órfãos)** | Local (mocks) | `npx tsx --test tests/lp-publicar.test.ts` | ✅ **Aprovado localmente** (10/10) | `sistema/tests/lp-publicar.test.ts` |
| **Isolamento público entre 2 domínios do mesmo tenant e 2+ tenants, `/lp-public` bloqueado e headers forjados** | Local (mocks) | `npx tsx --test tests/lp-public-isolation.test.ts` + `tests/final-isolation-recovery.test.ts` | ✅ **Aprovado localmente** (6/6 + 3/3) | `sistema/tests/lp-public-isolation.test.ts`, `final-isolation-recovery.test.ts` |
| **LP inicial explícita na raiz `/`, autorização e limpeza ao despublicar** | Local (mocks) | `npx tsx --test tests/domain-home-lp.test.ts` | ✅ **Aprovado localmente** (6/6) | `sistema/tests/domain-home-lp.test.ts` |
| **Integridade do snapshot publicado (sem `draftHtml` fallback nem mutação de marca pós-publicação)** | Local (mocks) | `npx tsx --test tests/lp-published-snapshot.test.ts` | ✅ **Aprovado localmente** (1/1) | `sistema/tests/lp-published-snapshot.test.ts` |
| **Isolamento de leads (`POST /api/public/leads`, `body.host` forjado, domínio errado e tenant inativo)** | Local (mocks) | `npx tsx --test tests/public-leads-isolation.test.ts` + `tests/final-isolation-recovery.test.ts` | ✅ **Aprovado localmente** (5/5) | `sistema/tests/public-leads-isolation.test.ts`, `final-isolation-recovery.test.ts` |
| **Isolamento de mídia (`GET/HEAD /api/media/[id]`, `lp_asset` HTML bloqueado, URL assinada social)** | Local (mocks) | `npx tsx --test tests/media-isolation.test.ts` | ✅ **Aprovado localmente** (5/5) | `sistema/tests/media-isolation.test.ts` |
| **Cache em 2 processos (negativo invalidado, remoção, tenant desativado e Redis fora)** | Local (mocks) | `npx tsx --test tests/domain-cache-consistency.test.ts` | ✅ **Aprovado localmente** (4/4) | `sistema/tests/domain-cache-consistency.test.ts` |
| **Exclusão segura de domínio (bloqueio com LP publicada, limpeza pós-despublicar e concorrência)** | Local (mocks) | `npx tsx --test tests/domain-delete.test.ts` | ✅ **Aprovado localmente** (4/4) | `sistema/tests/domain-delete.test.ts` |
| **Interfaces `DomainSetupModal.tsx` e `LPDetalhe.tsx` (contratos/estados sem `.lp.stage.consult`)** | Local (unitário) | `npx tsx --test tests/domain-setup-modal.test.ts tests/lp-detalhe-publish.test.ts` | ✅ **Aprovado localmente** (3/3 + 3/3) | `tests/domain-setup-modal.test.ts`, `tests/lp-detalhe-publish.test.ts` |
| **Notificação de leads (`Resend` validado, idempotência, sem `leads@stage.consult` implícito, polling sem Service Bus)** | Local (simulado) | `npx tsx --test tests/lead-email-notification.test.ts` | ✅ **Aprovado localmente** (5/5) / E-mail real ⏸️ | `sistema/tests/lead-email-notification.test.ts` |
| **Recuperação de propagação lenta de DNS e persistência após reinício planejado** | Local (disco temporário + reload) | `npx tsx --test tests/final-isolation-recovery.test.ts` | ✅ **Aprovado localmente** (3/3) | `sistema/tests/final-isolation-recovery.test.ts` |
| **Migrations aditivas e preservação de dados/tokens em base descartável** | Local (`@electric-sql/pglite`) | `node migrate-test.mjs` + `npx prisma validate` | ✅ **Aprovado localmente** | Seção 3.24 + `20261118000000_*`, `20261118010000_*` |
| **Typecheck & Build de produção Next.js 16.4** | Local | `npx tsc --noEmit` + `npm run build` | ✅ **Aprovado localmente** (0 erros, 51/51 rotas) | Output `next build` (seção 3.24) |
| **Portas públicas `80/TCP` e `443/TCP` abertas na VM (`172.212.145.134`)** | VM (`Stage-hub-mkt-dev`) | `Test-NetConnection 172.212.145.134 -Port 80/443` | ✅ **Aprovado na VM** | `TcpTestSucceeded: True` (seções 3.25/3.27) |
| **Cadastro e diagnóstico DNS autoritativo de `lp.garapalabs.com`** | Banco + DNS real GoDaddy | Query DB + `ns37/ns38.domaincontrol.com` | ✅ **Cadastro/NS verificados** / Apontamento ⏸️ | Token `stage-verify-17064e4734f8d480b26462d0`, `A`/`TXT` `ENOTFOUND` (seção 3.26) |
| **Deploy na VM (migrations, `web`, `worker`, `Caddyfile` e login/logout HTTP pelo IP)** | VM (`Stage-hub-mkt-dev`) | SSH indisponível (`22/TCP` timeout) + modo Caddy indefinido | ⏸️ **Bloqueado por acesso/configuração** | `/api/health` e `/api/internal/caddy/allow` ainda retornam `401` da versão antiga |
| **Provisionamento TLS real (`lp.garapalabs.com`), abertura HTTPS em janela anônima e e-mail real** | VM + DNS + Resend | Aguarda DNS na GoDaddy, deploy na VM e destinatário de teste | ⏸️ **Bloqueado por acesso/configuração** | Handshake TLS `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` (seções 3.27/3.28) |

- **Tarefa adicional pequena registrada (não iniciada nesta etapa)**: avaliar e alinhar `atualizarLP` ([`lp.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/lib/lp.ts#L295-L350)) e `reassociateLandingPageDomain` ([`domains.ts`](file:///c:/Users/Anderson/Documents/Stage/Stage%20Hub/sistema/src/lib/domains.ts#L813-L865)) para exigir também `sslStatus === ACTIVE` além de `dnsStatus === VERIFIED`.

---

## 4. Evidências Levantadas e Estado Atual dos Componentes

| Arquivo | Estado Atual | Observação / Próximos Passos |
|---|---|---|
| `sistema/src/lib/config.ts`, `sistema/src/proxy.ts` e `sistema/src/app/api/health/route.ts` | ✅ **Atualizados (Tarefas 02, 04, 05, Ask Caddy, Alvo TLS, Healthcheck e Fallback)**: Configuração runtime, leitura segura de `Host`, roteamento Painel vs LP, exceção exata para `GET /api/internal/caddy/allow`, `resolveCaddyTlsProbeTarget`, `/api/health` e `resolveTenantFallbackDomain`. | Concluídos e validados localmente. |
| `sistema/src/lib/auth.ts`, `api/login/route.ts`, `api/auth/switch-tenant/route.ts` | ✅ **Atualizados (Tarefa 03)**: Política unificada de cookies de sessão HTTP/HTTPS. | Validados localmente; teste em navegador na VM pendente. |
| `sistema/src/lib/domains.ts`, `sistema/src/lib/redis.ts`, `sistema/src/worker/index.ts`, `sistema/prisma/schema.prisma`, `sistema/src/app/api/domains/route.ts` e `sistema/src/app/api/internal/caddy/allow/route.ts` | ✅ **Atualizados até Desativação de Fallback e Reassociação**: Entrada canônica, PSL + zonas delegadas, contrato `direct-ip` (`A` + `TXT`), `verifyCustomDomain`, agendamento com backoff, endpoint `GET /api/internal/caddy/allow`, reconciliação TLS (`reconcileCaddyDomainTls`), bloqueio de fallback em `getDomainMapping` e `findAffectedFallbackLandingPages` / `reassociateLandingPageDomain`. | Apresentação completa de UI nas tarefas 22/23. |
| `sistema/src/lib/storage.ts`, `sistema/src/app/api/lp/[slug]/publicar/route.ts`, `sistema/src/lib/lp.ts`, `sistema/src/lib/ads.ts`, `sistema/src/app/lp-public/[host]/[slug]/route.ts`, `sistema/src/app/api/media/route.ts` e `sistema/src/app/api/media/[id]/route.ts` | ✅ **Atualizados no Storage e Endpoint de Publicação (`POST /api/lp/[slug]/publicar`)**: Exigência de sessão autorizada, mesmo tenant ativo, `DNS VERIFIED` e `SSL ACTIVE`, distinção de erros (`dns`/`tls`/`storage`), upload fora de transação, rechecagem de estado pós-upload e limpeza segura de artefato órfão preservando publicação anterior. | Concluídos e validados localmente. |
| `sistema/Caddyfile`, `sistema/Caddyfile.systemd`, `sistema/docker-compose.yml` e `sistema/docker-compose.systemd-caddy.yml` | ✅ **Preparados e Validados Localmente**: HTTP por IP do painel, HTTPS On-Demand TLS com `ask`, bloqueio público de `/api/internal*`, higienização de headers, `flush_interval -1`, privacidade da porta `3000` e variantes separadas (Compose vs `systemd`) fixadas em `Caddy v2.9.1`. | Não aplicados na VM ainda; decisão entre Variante A (Compose) e Variante B (`systemd`) pendente de confirmação na VM. |

---

## 5. Bloqueios e Pendências

- **Pendência 1 — Apontamento DNS de `lp.garapalabs.com`**: **[AGUARDANDO OPERADOR NA GODADDY]** `lp.garapalabs.com` já está cadastrado no tenant `Stage Consulting` com token `stage-verify-17064e4734f8d480b26462d0` (`dnsStatus = FAILED`, `sslStatus = PENDING`); aguardando adição dos registros `A` (`lp` -> `172.212.145.134`) e `TXT` (`_stage-verify.lp` -> `stage-verify-17064e4734f8d480b26462d0`) nos nameservers `ns37/ns38.domaincontrol.com`.
- **Pendência 2 — Modo de execução do Caddy na VM**: **[PENDENTE]** Confirmar na VM `Stage-hub-mkt-dev` se o Caddy roda em container Docker (Variante A: `docker-compose.yml` + `Caddyfile`) ou serviço nativo `systemd` (Variante B: `docker-compose.systemd-caddy.yml` + `Caddyfile.systemd`).
- **Pendência 3 — Acesso à VM (`172.212.145.134`)**: **[PENDENTE]** O ambiente local atual (Windows) não possui sessão/credenciais SSH para a VM `Stage-hub-mkt-dev`.
- **Pendência 4 — Validação de produção de Azure Blob, Resend e destinatário de teste**: **[PENDENTE]** Validar credenciais finais de Blob Storage na VM, `RESEND_MASTER_API_KEY` e informar destinatário de teste explícito para validação real de envio de e-mail na etapa final (Prompts 27–30).
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
| **Prompt 13 — Ajuste e Revisão de `POST /api/lp/[slug]/publicar`** | Exigência de sessão autorizada (`exigirEditor`), LP e domínio do mesmo tenant, tenant ativo, `dnsStatus === VERIFIED` e `sslStatus === ACTIVE` (domínio obrigatório); geração de URL canônica `https://<domain>/<slug>`; distinção de erros (`auth`, `validation`, `dns`, `tls`, `storage`); upload fora de transação; fechamento da janela entre rechecagem pós-upload e `landingPage.update` via `prisma.$transaction` (`Serializable`) sem I/O de rede; limpeza segura apenas do novo artefato órfão em falhas/concorrência (`P2034`/`P2003`) preservando a publicação anterior; suíte focada em `sistema/tests/lp-publicar.test.ts` (10/10) + `tsc --noEmit`. | ✅ Concluída e validada localmente |
| **Prompt 14 — Isolamento da Entrega Pública (`proxy.ts` & `lp-public/[host]/[slug]`)** | Bloqueio externo de `/lp-public/*` (`404`) em domínio público e painel, prova HMAC interna `x-stage-lp-sig` + validação de `extractRequestHost` (`reqHost.cleanHost === host`), filtro estrito por `tenantId` + `customDomainId` + `PUBLISHED`, remoção do fallback de raiz (`/` -> `404`), preservação de query strings e rotas `/api/public/*` e `/api/media/*`; suíte focada em `sistema/tests/lp-public-isolation.test.ts` (6/6) + `tsc --noEmit`. | ✅ Concluída e validada localmente |
| **Prompts 15–16 — LP Inicial Explícita por Domínio** | Campo aditivo `homeLandingPageId` (`@unique`, `onDelete: SetNull`) em `CustomDomain` + migração `20261118000000_custom_domain_home_lp`, `setCustomDomainHomeLandingPage` / `POST /api/domains` (`action: "setHome"` com `exigirEditor`), entrega da raiz `/` somente se publicada e vinculada ao mesmo tenant/domínio (`404` caso contrário), e limpeza automática ao despublicar/mover/remover; suíte focada em `sistema/tests/domain-home-lp.test.ts` (6/6, total 22/22) + `tsc --noEmit`. | ✅ Concluída e validada localmente |
| **Prompt 17 — Integridade do Snapshot Publicado (`lp-public/[host]/[slug]`)** | Confirmada ausência de fallback para `htmlAutocontido`/`draftHtml` (`503`/`404` fail-closed), removida chamada pós-leitura `resolveLpHtmlAssets(html, lp.tenantId)` na rota pública para manter ativos/marca congelados na publicação (sem alterar o preview autenticado), preservando publicação anterior em falhas; suíte focada em `sistema/tests/lp-published-snapshot.test.ts` (total 23/23) + `tsc --noEmit`. | ✅ Concluída e validada localmente |
| **Prompt 18 — Isolamento de `POST /api/public/leads`** | Resolução exclusiva por `extractRequestHost` + `getDomainMapping` (sem usar `body.host`/`body.tenantId` como autoridade e sem busca global), exigência de `customDomainId`, `tenant.isActive`, identificação explícita da LP e filtro `tenantId + customDomainId + PUBLISHED`; preservados POST relativo sem cookie, UTMs, honeypot e rate limit; suíte focada em `sistema/tests/public-leads-isolation.test.ts` (5/5, total 28/28) + `tsc --noEmit`. | ✅ Concluída e validada localmente |
| **Prompt 19 — Isolamento de Mídia em LPs (`GET/HEAD /api/media/[id]`)** | Campo aditivo `publishedAssetIds` em `LandingPage` (migração `20261118010000_lp_published_assets`) populado na publicação; `GET` e `HEAD /api/media/[id]` exigindo LP `PUBLISHED` vinculada ao domínio/tenant para acesso anônimo, bloqueando snapshots HTML `lp_asset` (`403`) e categorias isoladas, preservando sessão do tenant e URLs assinadas HMAC para o worker social (`signMediaAssetPath`); suíte focada em `sistema/tests/media-isolation.test.ts` (5/5, total 33/33) + `tsc --noEmit`. | ✅ Concluída e validada localmente |
| **Prompt 20 — Cache de Domínio e Cache HTTP** | Removido cache em memória por processo em `getDomainMapping` (uso exclusivo de Redis compartilhado + fallback direto ao PostgreSQL se Redis cair), adicionado `invalidateTenantDomainMappings` em `PATCH /api/admin/tenants` ao alterar `isActive`, e ajustado `Cache-Control` para `no-store, must-revalidate` em LPs públicas e `private, no-cache, must-revalidate` em `/api/media/[id]`; suíte focada em `sistema/tests/domain-cache-consistency.test.ts` (4/4) + `tsc --noEmit`. | ✅ Concluída e validada localmente |
| **Prompt 21 — Exclusão Segura de `CustomDomain`** | Bloqueio (`409 DomainConflictError`) ao tentar excluir domínio com LP `PUBLISHED` vinculada, checagem + limpeza de associações não publicadas + remoção em `prisma.$transaction` (`Serializable`) contra publicação concorrente (`P2034` -> `409`), preservação de status HTTP em `DELETE /api/domains` e invalidação de cache negando `ask` e roteamento imediatamente; suíte focada em `sistema/tests/domain-delete.test.ts` (4/4) + `tsc --noEmit`. | ✅ Concluída e validada localmente |
| **Prompt 22 — Interface `DomainSetupModal.tsx` (Modo VM)** | Guias atualizados para `A -> 172.212.145.134` + `TXT` de propriedade (Registro.br, Cloudflare, GoDaddy, HostGator), raiz aceitando `A` sem exigir `ALIAS/CNAME flattening`, cópia de nome relativo + FQDN + valor, estados reais (`dns_pending`, `dns_failed`, `tls_provisioning`, `tls_failed`, `ready`), esclarecimento de `TXT` != ACME, sem "subdomínio grátis" quando fallback desligado e sem sucesso prematuro no cadastro; `sistema/tests/domain-setup-modal.test.ts` (3/3) + `tsc --noEmit`. | ✅ Concluída e validada localmente |
| **Prompt 23 — Interface de Publicação (`LPDetalhe.tsx`)** | Seletor com prontidão real (`DNS` + `TLS`), bloqueio de publicação com explicação quando não apto e sem `.lp.stage.consult` com fallback desligado, exibição apenas da URL canônica do servidor (sem URL falsa), erros `dns`/`tls`/`storage` claros, integração de despublicar/reassociar/página inicial (`homeLandingPageId`) e preservação do preview autenticado; `sistema/tests/lp-detalhe-publish.test.ts` (3/3) + `tsc --noEmit`. | ✅ Concluída e validada localmente |
| **Prompt 24 — Notificação de Leads de LP (`email-service` & Worker)** | Validação estrita de `RESEND_MASTER_API_KEY`, destinatários e remetente autorizado (sem fallback implícito para `leads@stage.consult` e sem sucesso falso), claim atômico/idempotência contra duplicação, diferenciação explícita entre DNS SPF/DKIM de e-mail e `A`/`TXT` da LP, captura tolerante a falha do Service Bus e `processPendingLeadNotifications()` no polling do worker; `sistema/tests/lead-email-notification.test.ts` (5/5) + `tsc --noEmit`. | ✅ Concluída e validada localmente |
| **Prompts 25–26 — Preparação de Release Local & Checklist** | Revisão/teste aditivo e idempotente das migrations em base descartável (`@electric-sql/pglite`) preservando domínios/tokens/LPs, correção de build em `/api/health` e `/api/internal/caddy/allow` (`cacheComponents: true`), `tsc --noEmit` (0 erros), suíte focada (52/52 em 11 arquivos), `npm run build` aprovado, checklist de variáveis/backup/deploy/rollback compatível com schema e lista de pendências externas. | ✅ Concluída e validada localmente |
| **Prompt 26 (Execução de Deploy na VM)** | **Deploy não executado**: porta `22/TCP` inacessível a partir deste ambiente e sem credenciais SSH/CLI nem definição confirmada do modo Caddy (Docker vs `systemd`). Comandos exatos de inspeção, backup prévio, `prisma migrate deploy`, subida por variante, validação Caddy/UFW/NSG/saúde e rollback preparados na seção **3.25**. | ⏸️ Bloqueada (aguardando acesso/dados) |
| **Prompt 27 — Cadastro & Conferência DNS (`lp.garapalabs.com`)** | Conferido cadastro existente de `lp.garapalabs.com` no tenant `Stage Consulting` (`id: 22c82c33-04ba-4b49-bab5-9f34a9f9dee6`, token `stage-verify-17064e4734f8d480b26462d0`, `dnsStatus=FAILED`, `sslStatus=PENDING` preservados), identificados NS autoritativos GoDaddy (`ns37/ns38.domaincontrol.com`), confirmada ausência de conflitos `A`/`AAAA`/`CNAME`/`wildcard`, e gerados os registros exatos `A` (`lp`) e `TXT` (`_stage-verify.lp`) para aplicação pelo operador. | ⏸️ Aguardando propagação / aplicação pelo operador |
| **Prompt 28 — Validação Real de Provisionamento TLS (`lp.garapalabs.com`)** | **Bloqueada / Não aprovada**: diagnosticadas camadas reais sem editar banco — DNS `A`/`TXT` ainda `ENOTFOUND` (sem conflito `AAAA`/`CAA`), portas `80/443` abertas, Caddy/Next.js na VM ainda na versão antiga (`/api/internal/caddy/allow` e `/api/health` retornando `401` do Next.js em vez de `403`/`200`; `HTTP` sem redirecionar para `HTTPS`) e handshake TLS em `443` retornando `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` (alert 80). | ⏸️ Bloqueada (aguardando DNS + deploy na VM) |
| **Prompt 29 — Primeiro Teste Completo com LP Sintética** | **Real na VM bloqueado** (aguardando DNS `lp.garapalabs.com`, deploy seção 3.25, TLS real e destinatário de teste); executado ciclo E2E completo nos handlers reais com mocks locais em `sistema/tests/e2e-synthetic-lp-flow.test.ts` (1/1: publicar V1, `/slug`, mídia sem HTTP do painel, raiz `/`, lead até fila, edição de rascunho preservando V1, republicação V2 e despublicação `404`/`403`) + `tsc --noEmit`. | ⏸️ Real bloqueado / Local ✅ |
| **Prompt 30 — Testes Finais de Isolamento, Recuperação e Matriz Final** | Suíte completa executada (`56/56` em 13 arquivos de teste, incluindo `final-isolation-recovery.test.ts` para propagação lenta de DNS, isolamento multi-tenant/multi-domínio de LP/raiz/mídia/leads e persistência após reinício planejado); entregue matriz final na seção **3.29** separando aprovado localmente, aprovado na VM e bloqueado por acesso/configuração. Fluxo real na VM não declarado concluído até desbloquear deploy, DNS e TLS reais. | ✅ Localmente / ⏸️ VM bloqueada |
| **Próxima Tarefa (Pós-Desbloqueio VM / Tarefa Curta)** | 1) Desbloquear acesso SSH + modo Caddy + DNS GoDaddy + deploy seção 3.25 -> executar validação TLS/LP/e-mail reais na VM; 2) Tarefa curta: avaliar `sslStatus === ACTIVE` em `atualizarLP` e `reassociateLandingPageDomain`. | ⏳ Aguardando desbloqueio |
