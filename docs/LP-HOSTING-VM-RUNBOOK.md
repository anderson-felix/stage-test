# Implantação e homologação de LPs — execução pelo operador

Checkpoint atual: [LP-HOSTING-FINALIZATION.md](LP-HOSTING-FINALIZATION.md).
Auditoria anterior: [LP-HOSTING-AUDIT-FIXES.md](LP-HOSTING-AUDIT-FIXES.md).
Nada deste roteiro foi executado na VM. Não considera os prompts 26–30 homologados.

## 0. DNS inicial — garapalabs.com / GoDaddy

O hostname escolhido para o primeiro teste é **lp.garapalabs.com**. Ele representa
um cliente comum: não existe tratamento especial desse domínio no backend.
Cadastro no aplicativo e registros DNS ainda são tarefas do operador.

Consulta pública somente leitura nesta execução (18/11/2026): NS
`ns37.domaincontrol.com` e `ns38.domaincontrol.com`; A/AAAA de lp.garapalabs.com
e TXT de _stage-verify.lp.garapalabs.com retornaram ENOTFOUND. Esses nameservers
são da GoDaddy; confirmar novamente antes de editar, pois registro do domínio
na GoDaddy não garante que a zona continue sendo administrada lá.

1. No terminal da VM ou em outra máquina com dig:

   ```bash
   dig NS garapalabs.com +short
   dig +trace garapalabs.com NS
   ```

   Se os autoritativos forem domaincontrol.com, administrar a zona DNS GoDaddy.
   Se forem outros, usar o painel do provedor autoritativo. Não é necessário
   trocar nameservers ou criar Azure DNS.
2. No Stage Hub, selecionar o tenant de teste e cadastrar exatamente
   `lp.garapalabs.com`. Copiar os registros retornados pelo aplicativo. O código
   em `sistema/src/lib/domains.ts` gera TXT como `_stage-verify.<canonicalDomain>`;
   para a zona garapalabs.com, o nome relativo é `_stage-verify.lp`.
3. Na área DNS da zona garapalabs.com, adicionar/ajustar somente:

   | Tipo | Nome relativo | Valor |
   |---|---|---|
   | A | lp | 172.212.145.134 |
   | TXT | _stage-verify.lp | **token real exibido pelo aplicativo para esse cadastro** |

   O FQDN do TXT deve ser `_stage-verify.lp.garapalabs.com`. A GoDaddy acrescenta
   a zona ao nome relativo; conferir o nome final para não duplicar o sufixo.
   Não existe token de exemplo pronto para usar neste documento.
4. Conferir apenas os conflitos de `lp`: A com IP antigo, AAAA sem IPv6 operacional,
   CNAME incompatível ou encaminhamento. Um CNAME não aponta para endereço IP.
   Não apagar a zona nem registros de e-mail, raiz, www ou outros serviços.
   `garapalabs.com`, `www` e wildcard não fazem parte deste cadastro; exigem
   cadastros/verificações próprios caso sejam necessários depois.
5. Conferir propagação em resolvedores e no autoritativo observado:

   ```bash
   dig A lp.garapalabs.com +short
   dig AAAA lp.garapalabs.com +short
   dig TXT _stage-verify.lp.garapalabs.com +short
   dig @ns37.domaincontrol.com A lp.garapalabs.com +noall +answer
   dig @ns37.domaincontrol.com TXT _stage-verify.lp.garapalabs.com +noall +answer
   dig @1.1.1.1 A lp.garapalabs.com +short
   dig @8.8.8.8 TXT _stage-verify.lp.garapalabs.com +short
   ```

   Esperar A=172.212.145.134 e TXT igual ao token do cadastro. AAAA deve ficar
   ausente se não houver IPv6 funcional. Autoritativo correto + recursor antigo
   indica cache/propagação: respeitar TTL, inclusive cache negativo. Autoritativo
   errado indica zona/nome/registro incorreto. A ausência dos registros antes da
   configuração não é um defeito do backend.
6. Voltar ao painel e verificar DNS. Aguardar DNS VERIFIED e depois validar TLS
   dentro do worker, conforme seção 3, **antes** de publicar a primeira LP.

Documentação do provedor: [registro A](https://www.godaddy.com/help/add-an-a-record-19238)
e [registro TXT](https://www.godaddy.com/help/add-a-txt-record-19232).

## 1. Identificar a topologia e preservar a instalação

Na VM Ubuntu 22.04 `Stage-hub-mkt-dev` (172.212.145.134), verificar
`docker compose ls`, `docker ps`, `systemctl is-active caddy` e
`sudo ss -ltnp` antes de escolher **um** arquivo:

| Caddy | Compose | Worker → Caddy | Backend |
|---|---|---|---|
| Container | docker-compose.yml | caddy:443 | apenas web:3000 na rede Docker |
| systemd no host | docker-compose.systemd-caddy.yml | host.docker.internal:443, alias host-gateway | 127.0.0.1:3000 |

Preservar o nome de projeto Compose atualmente usado e seus volumes. Não subir
os dois Caddys simultaneamente. Não publicar 3000/3100 para a Internet. Na variante
systemd, Caddy deve ouvir 443 no gateway do host acessível pela bridge; confirmar
firewall/NSG sem abrir o backend. O admin Caddy permanece em loopback.

Usar `.env.example` com o complemento `.env.compose.example` ou
`.env.systemd-caddy.example`; não sobrescrever segredos existentes. Conferir:

- `DATABASE_URL` com host postgres e credenciais reais; `REDIS_URL` com host redis.
  Não deixar localhost dentro de containers. Para desenvolvimento fora do Docker,
  usar valores locais no ambiente de desenvolvimento, não os exemplos de produção.
- `APP_PANEL_HOST=172.212.145.134`, `APP_BASE_URL=http://172.212.145.134`,
  `COOKIE_SECURE=0` temporariamente, `NODE_ENV=production`, `TRUSTED_PROXY=1`.
- `DOMAIN_ROUTING_MODE=direct-ip`, `DOMAIN_TARGET_IPV4=172.212.145.134`,
  `DOMAIN_TLS_PROVIDER=caddy`, `LP_FALLBACK_ENABLED=false`.
- Destino/porta do probe são fixados pelo Compose escolhido; retirar overrides
  antigos de loopback. Headers encaminhados só são confiáveis porque Caddy os
  sobrescreve e o backend permanece privado.
- Storage connection string e container **privado**; `RESEND_MASTER_API_KEY`;
  configuração verificada do remetente e destinatários por tenant. Fallback
  somente com `STAGE_FALLBACK_FROM_EMAIL` explicitamente autorizado na Resend.
- Service Bus opcional: connection string e `AZURE_SERVICE_BUS_LEAD_QUEUE` iguais
  no web/worker. PostgreSQL mantém o trabalho mesmo sem Service Bus.

Não imprimir `.env` nem `docker compose config` completo. Rodar em `sistema/`:

```bash
COMPOSE_FILE=docker-compose.systemd-caddy.yml # ou docker-compose.yml, conforme inspeção
docker compose -f "$COMPOSE_FILE" config --quiet
docker compose -f "$COMPOSE_FILE" build web worker
```

O build requer acesso às fontes Google já usadas pelo projeto. O build de produção
local com Next 16.4.6 passou nesta finalização; ainda executar o build da imagem
Linux para a topologia escolhida antes de implantar. Auditar o lockfile também:
a auditoria final de produção ficou sem alertas conhecidos. Monaco usa snapshot
oficial fixado 0.58.0-dev-20261111 porque ainda não havia stable corrigido; o
wrapper/CDN e o sanitizer foram alinhados e testados localmente. Conferir o editor
na homologação e migrar para stable corrigido quando disponível e validado.

## 2. Backup, migrations e ordem

1. Guardar commit/imagens anteriores, `.env` em local protegido, configuração
   Caddy e inventário dos volumes. Fazer backup consistente do PostgreSQL e
   conferir se o dump pode ser restaurado em banco isolado. Exemplo de dump:

   ```bash
   docker compose -f "$COMPOSE_FILE" exec -T postgres sh -c \
     'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > stage-before-lp-fixes.dump
   ```

2. Parar **web e worker antigos** antes das migrations (evita produtores/consumidores
   antigos concorrendo com a recuperação). Não parar/apagar volumes:

   ```bash
   docker compose -f "$COMPOSE_FILE" stop web worker
   docker compose -f "$COMPOSE_FILE" run --rm --no-deps web npx prisma migrate deploy
   ```

3. Migrations aditivas, nesta ordem (as três primeiras podem já estar aplicadas):
   `20261118190000_lead_delivery_lease`,
   `20261118191000_lead_provider_idempotency`,
   `20261118192000_lp_published_metadata`,
   **`20261118200000_lp_editorial_revision`** (nova nesta finalização).
   Não executar reset/db push nem editar migrations já aplicadas.
4. `failed/sending` históricos viram `failed_final` com
   `LEGACY_DELIVERY_REVIEW_REQUIRED`. Concluídos permanecem intactos. Revisar o
   provedor antes de liberar essas notificações. LPs antigas precisam de
   republicação explícita; não há backfill inferindo metadados pelo rascunho.
5. Subir web/worker novos, verificar health/logs e aplicar o Caddy correto somente
   depois de validar sua configuração:

   ```bash
   docker compose -f "$COMPOSE_FILE" up -d web worker
   # Variante Compose:
   docker compose -f "$COMPOSE_FILE" run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile
   docker compose -f "$COMPOSE_FILE" up -d caddy
   # Ou variante systemd: salvar configuração anterior, instalar Caddyfile.systemd,
   # validar com caddy validate --config /etc/caddy/Caddyfile e só então reload.
   ```

   Conferir sem expor segredos:

   ```bash
   docker compose -f "$COMPOSE_FILE" ps
   docker compose -f "$COMPOSE_FILE" exec web curl -fsS -H 'Host: 127.0.0.1:3000' http://127.0.0.1:3000/api/health
   docker compose -f "$COMPOSE_FILE" logs --tail=100 web worker
   # Compose: docker compose -f "$COMPOSE_FILE" logs --tail=100 caddy
   # systemd: sudo systemctl status caddy --no-pager; sudo journalctl -u caddy -n 100 --no-pager
   ```

Preservar `postgres-data`, `redis-data`, `hub-data`, `workspace` e, em Compose,
`caddy-data`/`caddy-config`. No host, preservar `/var/lib/caddy/.local/share/caddy`
e permissões do usuário do serviço. Nunca usar `down -v`.

## 3. Verificações reais após deploy

1. Criar dois tenants e dois domínios de um mesmo tenant. Consultar o DNS **atual**:
   A deve apontar para 172.212.145.134; TXT deve conter o token exibido no cadastro.
   Conferir também AAAA/CAA se emissão falhar. Não presumir que
   `lp.garapalabs.com` já esteja configurado ou disponível para testes.
2. Aguardar DNS VERIFIED e executar, **dentro do worker**, antes da primeira LP:

   ```bash
   docker compose -f "$COMPOSE_FILE" exec worker node -e "require('node:dns').lookup(process.env.CADDY_TLS_PROBE_HOST, (error, address) => { if(error) throw error; console.log(address); })"
   docker compose -f "$COMPOSE_FILE" exec worker npx tsx scripts/probe-lp-tls.ts lp.garapalabs.com
   ```

   Usar o domínio de teste autorizado pelo operador. Probe usa SNI do cliente,
   cadeia confiável e `rejectUnauthorized=true`. HTTP 404 após TLS válido é
   aceitável antes de publicar. Em falha, conferir resolução do destino, ask
   interno e logs Caddy; nunca forçar sslStatus=ACTIVE ou desabilitar validação.
3. Executar smoke de storage documentado em `sistema/docs/DEPLOY.md` dentro do
   worker: grava/lê/remove exclusivamente objeto sintético. Conferir acesso
   privado e prefixos por tenant. Não expor o container publicamente.
4. DNS VERIFIED → TLS ACTIVE → publicar A → acessar /slug. Raiz / deve retornar
   404 até seleção explícita de homepage. Testar imagens, formulário e UTMs;
   confirmar lead salvo antes de avaliar e-mail.
5. E-mail real somente para destinatário de teste explicitamente autorizado.
   Confirmar aceite/provider ID e depois entrega no provedor/caixa. Sem Service
   Bus, polling deve concluir; queda do Bus não pode perder o registro queued.
6. Manter visitas à LP enquanto republica e despublica; métricas não devem gerar
   conflito editorial. Em homologação isolada, editar de fato durante upload e
   disputar publicação/DELETE: deve existir conflito, sem sobrescrita silenciosa.
   Editar HTML/SEO/GTM para B: público continua A. Simular falha de republicação
   em ambiente isolado: A permanece. Republicar B: HTML/tags mudam juntos.
   Despublicar: /slug, raiz e vínculo público de mídia deixam de autorizar.
7. Repetir acessos anônimos entre tenants/domínios, domínio desconhecido e APIs
   PATCH/PUT/reassociate. Tentar mídia de outro tenant no HTML: 403 sem novo Blob.
   Tenant inativo, TLS pendente e falta de snapshot devem bloquear movimentação.
8. Verificar redirecionamento real (caminho/query preservados), painel HTTP por IP
   e bloqueio público das APIs internas nas duas topologias aplicáveis:

   ```bash
   curl -sS -I 'http://DOMINIO/slug?utm_source=check'
   curl -sS -o /dev/null -w '%{http_code}\n' http://172.212.145.134/api/internal/caddy/allow
   curl -sS -o /dev/null -w '%{http_code}\n' https://DOMINIO/api/internal/caddy/allow
   ```

   Esperar Location HTTPS com mesmo path/query e 403 nas APIs internas. O ask
   direto interno do Caddy deve continuar funcionando.
   No host, conferir `sudo ss -ltnp` para 80/443 e ausência de backend público.
   Para separar falha de ask de falha TLS, consultar de dentro da rede privada:

   ```bash
   docker compose -f "$COMPOSE_FILE" exec worker curl -fsS 'http://web:3000/api/internal/caddy/allow?domain=lp.garapalabs.com'
   ```

   Depois de DNS VERIFIED e tenant ativo, esperar allowed=true mesmo sem LP;
   host desconhecido ou tenant inativo deve negar. Não expor esse caminho na borda.
9. Segundo hostname do mesmo tenant e domínio de um segundo tenant são
   pré-requisitos **ainda não provisionados**: escolher, cadastrar, configurar
   DNS e verificar cada um separadamente antes dos testes de isolamento.
10. Em **PostgreSQL/Redis isolados**, disputar DNS/TLS e e-mail com dois workers;
   matar um após claim e após aceite simulado; aguardar expiração e recuperar.
   O antigo não pode gravar/liberar o novo lease. Testar revogação com DEL falho,
   retorno do Redis com chave antiga e preenchimento atrasado: LP/mídia bloqueadas.
   Estes ensaios reais não foram executados localmente por falta do daemon Docker.

## 4. Diagnóstico de e-mail e recuperação controlada

O DNS da LP não configura SPF/DKIM nem autoriza remetentes. Para envio real,
configurar o domínio de e-mail na Resend e copiar exatamente os registros
SPF/DKIM e demais diagnósticos retornados pelo provedor no cadastro correspondente.
Não inventar valores TXT/CNAME nem alterar MX existentes sem necessidade.
Destinatário real de teste precisa de autorização explícita antes de enviar.

Na interface CRM, configuração pendente oferece recuperação após correção;
processamento e retry agendado devem aguardar; final/ambíguo exigem operação.
O endpoint POST `/api/leads/<id>/resend` exige editor e tenant proprietário:

| HTTP | outcome | Significado |
|---|---|---|
| 200 | accepted | Aceito pelo provedor, sem garantia de caixa de entrada |
| 200 | already_sent | Já aceito; não reenviado |
| 202 | queued / processing / retry_scheduled | Sem confirmação de envio |
| 422 | config_pending | Corrigir configuração e recuperar |
| 409 | failed_final / ambiguous | Reconciliar; sem reenvio cego |

`ok` e `providerAccepted` só são verdadeiros com aceite registrado. Um HTTP 2xx
não deve ser apresentado como reenvio concluído. Recuperação normal preserva
contadores, payload, chave e firstAttemptAt; não renova a janela do provedor.

```bash
docker compose -f "$COMPOSE_FILE" exec worker npx tsx scripts/lead-notification-admin.ts status LEAD_ID
# Depois de corrigir configuração (config_pending, dentro da janela e do limite):
docker compose -f "$COMPOSE_FILE" exec worker npx tsx scripts/lead-notification-admin.ts requeue LEAD_ID
```

`sent_custom/sent_fallback` indicam aceite do provedor, não entrega garantida na
caixa. `retry_scheduled` tem nextAttemptAt; `sending` tem lease; limite 8 tentativas.
Chave estável e payload congelado são mantidos. A Resend retém idempotência por
24h; o serviço interrompe aos 23h. Não existe exactly-once ilimitado.

Para `failed_final`, `ambiguous` ou registro legado: reconciliar logs/provedor
primeiro. Somente após decisão explícita de reenvio e ciência do risco de duplicata:

```bash
docker compose -f "$COMPOSE_FILE" exec worker npx tsx scripts/lead-notification-admin.ts requeue LEAD_ID --ack-possible-duplicate
```

Este comando não envia diretamente; libera o trabalho durável para o worker.
Notificações concluídas nunca são reabertas por ele. Não alterar payload/chave
manualmente entre tentativas da mesma notificação.

## 5. Rollback

Em falha, parar os novos produtores/consumidores; preservar banco, Blobs, fila e
certificados. Preferir imagem anterior **com worker parado** até avaliar os novos
estados: o worker antigo não entende lease/retry/ambiguous e não deve reassumir
automaticamente. Restaurar Caddy anterior se necessário. Colunas aditivas podem
permanecer durante rollback; não rodar migration destrutiva. Restauração de backup
é medida deliberada, pois perde leads posteriores ao dump; reconciliar esses
registros e envios externos antes de qualquer restauração. Conferir novamente
DNS/TLS/health e homepage antes de reabrir tráfego.

Durante rollback desta finalização, manter a coluna editorialRevision. Uma imagem
antiga que não avança essa revisão não deve operar junto com a nova; parar ambas
as gerações antes de trocar imagens. Não executar DROP COLUMN ou reset.

Na B2s, medir RAM/CPU/swap, latência e logs durante visitas, publicação, render e
envio; não há ensaio de carga nesta execução e não se promete capacidade.

## Erro de coluna já existente / CLI Prisma incorreta

Na raiz `Stage Hub`, usar a CLI versionada da aplicação:

```bash
npm --prefix sistema run db:migrate:status
npm --prefix sistema run db:migrate:deploy
```

Dentro de `sistema`, os mesmos comandos são `npm run db:migrate:status` e
`npm run db:migrate:deploy`. O projeto usa Prisma 6; não criar configuração Prisma 8
para contornar um `npx` executado fora da aplicação.

Se uma coluna já existir, conferir primeiro `_prisma_migrations`, os tipos,
defaults, índices e registros existentes. Não apagar a coluna ou marcar a migration
como aplicada sem conferir todos os seus efeitos. O procedimento oficial de
[recuperação de migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/patching-and-hotfixing)
permite completar os passos faltantes e reconciliar com migrate resolve.

Em 19/11, o banco configurado localmente tinha um outbox histórico e zero leads;
foi reparado com o SQL separado `prisma/repairs/20261119_reconcile_lead_outbox.sql`,
verificado, reconciliado e atualizado. O SQL aborta se encontrar leads e não é
um comando obrigatório do deploy. Não o usar cegamente em outro ambiente.
Histórico, resultados e migrations extras preservadas estão no checkpoint.
