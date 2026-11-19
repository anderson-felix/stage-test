> Histórico da auditoria anterior. A finalização atual, seus resultados e riscos estão em [LP-HOSTING-FINALIZATION.md](LP-HOSTING-FINALIZATION.md).

# Correções do hosting de LPs — checkpoint canônico

Este documento é a fonte canônica desta execução (18/11/2026). Os arquivos
`docs/DOMAINS-VM-PROGRESS.md` e `sistema/docs/DOMAINS-VM-PROGRESS.md` são históricos;
seus relatos não comprovam o estado atual da VM ou dos provedores.

## Etapa 0 — base registrada

- Branch: `master`; HEAD: `8d5cfa55260feb95632c3f855f57b48f25c62991`.
- Árvore inicialmente limpa (`git status --short`). Base solicitada:
  `1ff1f08b55ce546758cd9a0b8aa77d704eed08bb`.
- Instruções lidas: `sistema/AGENTS.md`, documentação de produto/arquitetura e
  guia local de Route Handlers do Next instalado. Auditoria nominal não encontrada.
- Pontos de entrada confirmados: brand-assets/storage/lp, config/Compose/Caddy,
  publicar/edição/domains, email-service/worker/schema, redis e rotas públicas.
- Pendências: isolamento e URLs de mídia; proxy TLS; invariantes de publicação;
  recuperação/idempotência de e-mail; leases DNS/TLS; snapshot SEO; revogação;
  regressão e roteiro de implantação.
- Comandos: `git status --short`, `git branch --show-current`, `git rev-parse HEAD`,
  `rg --files`, leituras dos arquivos citados. Sem alterações em infraestrutura.
- Próxima ação: etapa 1, conversão de mídia com tenant obrigatório.

## Limites de validação

Nenhum deploy, alteração DNS/provedor, reset de banco ou envio real de e-mail é
autorizado nesta execução. Resultados locais não equivalem à homologação da VM.

## Etapa 2 — referências completas

- Cheerio interpreta atributos HTML; URLs são reconhecidas pela origem canônica
  do painel e pathname completo. Query/fragmento são consumidos na substituição;
  src/srcset/poster/href, estilos inline e blocos CSS são tratados. Nenhum fetch externo.
- Arquivos: brand-assets e seu teste. Comando: `node --import tsx --test tests/brand-assets-authorization.test.ts`:
  3/3 passaram, incluindo URLs absolutas, CSS e referência proibida.
- Python do host não executável; edição realizada com patch/Node disponíveis.
- Próxima ação: etapa 3, TLS e proxy por topologia.

## Etapa 3 — topologias TLS/proxy

- Compose fixa `caddy:443`; variante systemd fixa `host.docker.internal:443`
  com `extra_hosts: host.docker.internal:host-gateway` para Docker Linux.
- Alias adicionado à allowlist server-side. SNI, validação de certificado, ask
  interno e aceitação de HTTP 404 depois do handshake permanecem.
- `.env.example` deixa o destino a cargo da topologia e usa TRUSTED_PROXY=1.
  Caddy já sobrescreve forwarded headers, remove contexto e protege backend.
- Arquivos: dois Compose, config.ts, .env.example, hosting-topology.test.ts,
  scripts/probe-lp-tls.ts. Testes: topology + public-leads-isolation: 7/7 passaram.
- Docker CLI presente, daemon Linux indisponível (`docker info`: pipe ausente).
  Handshake e integração PostgreSQL/Redis reais não executados. Parser YAML validou
  os destinos das duas variantes; `docker compose config --quiet` será checado ao final.
- Próxima ação: etapa 4, fechar caminhos alternativos de publicação.

## Etapa 4 — publicação e associação

- Validador de domínio extraído para `lp-publication.ts`, compartilhado por
  publicação e edição/reassociação. PATCH/PUT rejeitam promoção direta; edição
  preserva status enum e ignora promoção por legacyStatus.
- Toda associação valida tenant; movimentação publicada exige tenant ativo,
  Blob existente, DNS VERIFIED e TLS ACTIVE, derivando URL do domínio autorizado.
- `atualizarLP` executa leitura/validação/escrita numa transação Serializable;
  reassociate usa o mesmo serviço. Upload continua fora da transação principal;
  limpeza de homepage e invalidação preservadas.
- Arquivos: lp.ts, domains.ts, publicar/route.ts, lp-publication.ts, novo teste
  lp-alternative-mutations. Testes afetados: 19/19; novo serviço + publicar: 11/11.
  `npx tsc --noEmit --pretty false`: passou após ajuste do env tipado no teste TLS.
- Concorrência PostgreSQL real pendente (daemon indisponível).
- Próxima ação: etapa 5, fila durável recuperável.

## Etapa 5 — fila recuperável

- Claim condicional com UUID por execução, lease de 60s, transporte limitado a
  15s (fetch 12s) e escrita final condicionada à posse não expirada.
- Uma tentativa por claim, backoff persistente de 30s até 1h, limite 8;
  polling seleciona retries vencidos e sending expirado. Estados consultáveis:
  config_pending, failed_final, retry_scheduled, processing; sem already_sent falso.
- Migration `20261118190000_lead_delivery_lease` adiciona campos/índice;
  failed/sending históricos exigem revisão antes de reprocessamento. Concluídos
  não são tocados. Função administrativa requeueLeadNotification adicionada.
- Arquivos: schema/migration, email-service, worker, teste de notificação e helper
  de fronteira Prisma. `prisma generate` passou; 7/7 testes passaram com transporte
  simulado (nenhum e-mail real), incluindo reinício/disputa/backoff/permanente.
- Próxima ação: etapa 6, chave/payload estáveis e ambiguidade.

## Etapa 6 — idempotência e Service Bus

- Documentação oficial consultada em 18/11/2026:
  https://resend.com/docs/dashboard/emails/idempotency-keys — retenção 24h;
  mesma chave exige mesmo payload. A implementação interrompe automaticamente
  após 23h da primeira preparação, com margem operacional; não promete exactly-once.
- Chave `lead-notification/<leadId>` e envelope congelado persistidos antes do
  envio. Provider ID salvo; retorno perdido/reinício recuperam pelo mesmo payload.
  Ambiguidade fora da janela exige intervenção, sem reenvio automático.
- Migration `20261118191000_lead_provider_idempotency` adicionada. A fila única
  PostgreSQL continua sendo a autoridade para local/polling/Service Bus.
- Service Bus usa auto-complete somente após serviço retornar: envio concluído
  ou estado durável/lease recuperável já existente. Erro de banco rejeita handler
  e permite redelivery. Falha de sinalização mantém queued no PostgreSQL.
- `node --import tsx --test tests/lead-email-notification.test.ts`: 9/9 passaram;
  `tsc --noEmit` passou. Inclui aceite com resposta perdida, entrega repetida,
  reinício antes da persistência, expiração da janela; transporte simulado.
- Próxima ação: etapa 7, lease atômico DNS/TLS.

## Etapa 7 — lease DNS/TLS

- DNS manual/worker e TLS usam updateMany com ID/tenant e lease livre ou expirado;
  count=1 obrigatório antes de I/O. UUID exclusivo mesmo com workerId reutilizado.
- Todas as persistências e liberações usam ID + lockedBy + lockedUntil > agora;
  execução expirada não grava nem libera lease sucessor. Sem transação durante I/O.
- Worker calcula novo horário por domínio e por reconciliação TLS (não usa início do lote).
- Arquivos: domains.ts, worker/index.ts, domain-lease.test.ts.
- Testes domain-lease + final-isolation-recovery: 5/5 passaram; tsc passou.
  Fronteiras simuladas; inclui disputa, recuperação e execução antiga sem sobrescrita.
- Atomicidade PostgreSQL real não executada: Docker Linux indisponível.
- Próxima ação: etapa 8, congelar metadados publicados.

## Etapa 8 — snapshot SEO/tracking

- `publishedMetadata` versionado (JSON) é gravado na mesma transação que o Blob.
  A rota pública usa exclusivamente esse envelope para tags adicionais, mantendo
  as tags existentes do artefato e o interceptor de leads.
- htmlAutocontido recebe o HTML lido no início da publicação; rechecagem final
  exige updatedAt inalterado, impedindo combinar HTML/metadados concorrentes.
- Sem backfill inferido do rascunho. Legados sem envelope servem apenas tags do
  Blob e precisam de republicação explícita para congelar metadados adicionais.
- Arquivos: schema/migration `20261118192000_lp_published_metadata`, lp.ts,
  publicar/route.ts, rota pública e teste de snapshot ampliado para SEO_B/GTM_B.
- Generate passou; snapshot + publicar: 11/11 passaram (banco/Blob simulados).
- Próxima ação: etapa 9, autorização autoritativa apesar de cache obsoleto.

## Etapa 9 — revogação apesar de cache

- getDomainMapping sempre revalida no PostgreSQL. Redis não autoriza conteúdo,
  inclusive depois de DEL falho, recuperação ou preenchimento concorrente antigo.
  Erro do banco propaga falha fechada, sem fallback autorizador em cache/memória.
- LP, mídia e leads usam essa resolução; vínculos de LP/mídia continuam consultados
  no banco. Rechecagem de tenant ativo na captura preservada.
- Arquivos: redis.ts, final-isolation-recovery.test.ts. Testes de cache/LP/mídia:
  15/15 passaram; nova sequência cache positivo → revogação → DEL falho → retorno
  do Redis com chave antiga, incluindo tenant/DNS/remoção/associação: 8/8 passaram.
- Fronteiras simuladas. Redis/PostgreSQL reais pendentes. Custo deliberado:
  consulta autoritativa por resolução; TTL não é usado como garantia de revogação.
- Próxima ação: etapa 10, regressão, build e roteiro VM.

## Etapa 10 — regressão e implantação preparada

### Resultado final dos comandos (Windows, Node 24.21.0)

| Comando em sistema/ | Resultado real | Ambiente |
|---|---|---|
| `node --import tsx --test tests/*.test.ts` | **78/78 passaram**, 13 suites | Serviços/handlers reais; banco/storage/DNS/TLS/provedor simulados |
| `npx tsc --noEmit --pretty false` | passou | TypeScript local, cliente Prisma regenerado |
| `npx --no-install prisma generate` | passou | Prisma 6.5.0 |
| `npx --no-install prisma validate` | passou | Validação estática do schema |
| `prisma migrate diff --from-schema-datamodel <schema HEAD> --to-schema-datamodel prisma/schema.prisma --script` | DDL incremental confere com campos/índice novos | Sem aplicar migrations ou conectar a banco |
| `docker compose --env-file .env.example -f docker-compose.yml config --quiet` | passou | Configuração Compose efetiva, sem imprimir segredos |
| mesmo comando para docker-compose.systemd-caddy.yml | passou | Configuração Compose efetiva |
| ESLint em todos os TS/TSX alterados/adicionados | passou, exit 0 | Sem alterar regras de lint de produção |
| `npm run lint` (repositório inteiro) | 13 erros em arquivos fora desta correção; permanece pendente | Exemplos: efeitos React em admin/tenants, claude, estudio, login, DomainSetupModal; any em social/arquivo |
| `git diff --check` | passou | Sem erro de whitespace |
| `npm run build` | **não concluiu**, exit 1: Turbopack falha ao criar/conectar subprocesso de CSS | Windows; repetiu inclusive com permissão fora do sandbox |
| `npm run build -- --webpack` | **não concluiu**: ENOTFOUND fonts.googleapis.com e EPERM em .next/server/app/(hub)/admin | Windows/rede do ambiente |
| `docker info` | daemon Linux indisponível, pipe dockerDesktopLinuxEngine ausente | PostgreSQL/Redis e Caddy reais não executados |

Logs locais: `lp-regression.log`, `lp-lint.log`, `lp-lint-changed.log`,
`lp-build.log`, `lp-build-webpack.log`, nesta pasta. O checkpoint é a fonte
canônica do resultado; logs intermediários não substituem a interpretação acima.

### Complementos encontrados durante a regressão

- POST real agora é testado com htmlAutocontido e conversor reais, sem mocks
  dessas funções: mídia proibida retorna 403 sem download/upload e mantém Blob anterior.
- PATCH/PUT e reassociate reais exercitados; movimentação exige referência de
  snapshot HTML com prefixo do tenant. Despublicação confere updatedAt e devolve
  conflito em corrida, sem sobrescrever uma edição concorrente.
- Captura de leads foi testada com dois IPs confiáveis diferentes; headers
  forwarded sem confiança não alteram a chave. URLs assinadas de mídia também
  consultam tenant ativo antes de entregar bytes, sem quebrar assinaturas válidas.
- Recuperação de e-mail cobre oitavo lease abandonado e mensagem Service Bus
  repetida com fetch simulado; confere Idempotency-Key e provider ID. Nenhum
  e-mail real foi enviado. Construtor inválido do Bus também mantém queued.
- Caddy tem redirecionamento HTTP explícito para HTTPS preservando `{uri}` e
  bloqueio de `/api/internal/*` antes do redirect; painel por Host específico
  permanece HTTP. Sintaxe/comportamento reais Caddy exigem validação na VM.
  Referência: https://caddyserver.com/docs/caddyfile/directives/redir .
- Tags existentes são detectadas por parser HTML para evitar duplicação por
  ordem de atributos. Legados sem publishedMetadata não injetam SEO/GTM de rascunho.
- `.gitignore` permite apenas os dois exemplos de topologia novos. Dockerfile
  copia scripts de probe/admin para a imagem. Documentação de produto/arquitetura,
  deploy e changelog apontam para este checkpoint e o roteiro.

### Oito grupos de problemas

| Problema | Situação | Limite |
|---|---|---|
| Mídia entre tenants e referências absolutas | corrigido/testado localmente | Fronteira Azure simulada |
| TLS/proxy por topologia e IP do visitante | parcialmente validado | Config estática passou; handshake/rede/Caddy reais pendentes |
| Publicação/edição/reassociação alternativas | corrigido/testado localmente | Concorrência PostgreSQL real pendente |
| Fila de e-mail sem recuperação | parcialmente validado | Lease/backoff/limite/reinício passaram; migration real pendente |
| Idempotência e coordenação Service Bus | parcialmente validado | Transporte simulado; sem envio real; janela Resend limitada |
| Lease DNS/TLS não atômico | parcialmente validado | CAS/posse/corridas testados; PostgreSQL real pendente |
| SEO/tracking editável na versão pública | corrigido/testado localmente | Legados exigem republicação; Blob real pendente |
| Cache restaurando acesso revogado | corrigido/testado localmente | Testes de queda/recuperação/preenchimento antigo; Redis/PostgreSQL reais pendentes |

### Arquivos relevantes e migrations

- Mídia: `sistema/src/lib/brand-assets.ts`, `render.ts`, `storage.ts` reutilizado
  para validação do prefixo, `api/media/[id]/route.ts`.
- Publicação: `src/lib/lp.ts`, novo `lp-publication.ts`, `domains.ts`,
  `api/lp/[slug]/publicar/route.ts`, `lp-public/[host]/[slug]/route.ts`.
  PATCH/PUT existentes continuam delegando a atualizarLP, agora protegido.
- E-mail: `src/lib/email-service.ts`, `src/worker/index.ts`, schema Prisma.
- Cache/config: `src/lib/redis.ts`, `config.ts`, dois Compose/Caddyfiles,
  `.env.example`, complementos por topologia, `.gitignore`, Dockerfile.
- Operação: `scripts/probe-lp-tls.ts`, `scripts/lead-notification-admin.ts`.
- Migrations novas, sem alteração de migration antiga:
  `20261118190000_lead_delivery_lease`,
  `20261118191000_lead_provider_idempotency`,
  `20261118192000_lp_published_metadata`.
- Testes novos: brand-assets-authorization, hosting-topology, lp-alternative-mutations,
  domain-lease e helper Prisma. Ampliados: lead-email-notification,
  lp-published-snapshot, public-leads-isolation, media-isolation,
  domain-cache-consistency, final-isolation-recovery, e2e-synthetic-lp-flow.

### Pendências concretas e próxima ação do operador

Usar [LP-HOSTING-VM-RUNBOOK.md](LP-HOSTING-VM-RUNBOOK.md). O build Linux precisa
passar antes da implantação. Depois: backup/restauração de ensaio, migrations,
identificação da topologia ativa, handshake dentro do worker antes da primeira LP,
DNS atual (incluindo lp.garapalabs.com somente se autorizado), storage privado,
entrega real de e-mail para destinatário autorizado, concorrência PostgreSQL,
retorno de cache Redis antigo, Caddy validate/redirect/bloqueio interno e reinício.

Revisar failed/sending históricos antes de reprocessar: podem ter aceite externo
desconhecido. `requeue --ack-possible-duplicate` é decisão explícita do operador;
não há reenvio cego depois da janela de idempotência. Legados de LP devem ser
republicados para congelar tags adicionais. Autorização agora consulta o banco
em cada resolução: medir a carga na B2s e monitorar disponibilidade PostgreSQL.

Nenhuma mudança em VM/DNS/provedor, deploy, envio real, reset, remoção de dados
ou volumes, commit ou push foi realizado. A árvore inicial limpa foi preservada
como base; as alterações permanecem locais para revisão. O remoto local é
Bitbucket e o commit de auditoria não está disponível neste checkout; não se
afirma equivalência verificada com o HEAD do GitHub informado.

## Etapa 1 — isolamento na incorporação

- Tenant obrigatório no conversor; consulta por ID + tenant; validação do prefixo
  no storage também para logos. Referência desconhecida aborta antes do download.
- Removidos catches que ocultavam autorização no preview/render.
- Arquivos: `sistema/src/lib/brand-assets.ts`, `render.ts`, teste
  `brand-assets-authorization.test.ts` (executa htmlAutocontido/conversor reais).
- Comando: `node --import tsx --test tests/brand-assets-authorization.test.ts tests/lp-publicar.test.ts`
  em sistema: 12/12 passaram (fronteiras banco/storage simuladas). Inclui
  preservação da publicação anterior e limpeza de upload órfão.
- Rastreabilidade: remoto local é Bitbucket; `git cat-file -t` não encontrou a
  base solicitada. Não houve troca de remoto/branch nem download de outro checkout.
- Próxima ação: etapa 2, interpretar referências completas.
