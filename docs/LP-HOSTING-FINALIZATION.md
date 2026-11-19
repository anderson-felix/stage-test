# Finalização do hosting de LPs — checkpoint canônico

Esta é a fonte canônica da execução de finalização. A auditoria anterior em
LP-HOSTING-AUDIT-FIXES.md permanece histórica; o roteiro operacional é
LP-HOSTING-VM-RUNBOOK.md. Nenhuma homologação real é presumida.

## Etapa 0 — base

- Branch `master`, HEAD `e9686d760d8993a66a5aeacd81bb3c0ef695984e`, workspace limpo.
- Remoto local Bitbucket; não alterado. Referência histórica fornecida:
  `9433365e6ac7d63329ab0d06692cb737a618936e`; sem checkout/reset.
- Lidos AGENTS.md, documentos anteriores, guias locais Next e documentação da área.
  Relatório Revalidacao_Stage_Hub_Codex_2026-11-18.md não encontrado no workspace.
- Confirmados no HEAD: conversor em modo fragmento; comparação de updatedAt na
  publicação/despublicação enquanto visitas escrevem a mesma linha; endpoint
  resend com sucesso por exclusão e UI com mensagem fixa; Next 16.4.0 instalado.
- Testes relevantes: brand-assets-authorization, lp-publicar,
  lp-published-snapshot, lp-alternative-mutations, lead-email-notification,
  e2e-synthetic-lp-flow, isolamento de mídia/cache/domínios e leases.
- Comandos: git status/branch/rev-parse/remote, rg de mutações de LandingPage,
  leituras de package/schema/serviços/rotas/UI/testes. Sem alterações externas.
- Próximo passo: etapa 1, modos explícitos de documento e fragmento.

## Etapa 1 — documento preservado

- Causa confirmada: parse5 em modo fragmento descartava a estrutura do documento.
- Contrato explícito document/fragment no conversor e render; LPs usam document.
- Arquivos: brand-assets.ts, render.ts, brand-assets-authorization.test.ts.
- `node --import tsx --test tests/brand-assets-authorization.test.ts`: 6/6 passaram,
  incluindo documento completo/atributos/scripts/CSS, fragmento e publicação real
  recusando mídia de outro tenant antes de upload (fronteiras externas simuladas).
- Próximo passo: revisão editorial e retry de transação na etapa 2.

## Etapa 2 — visitas e concorrência editorial

- Migration nova `20261118200000_lp_editorial_revision`: revisão editorial inicia
  em zero para registros existentes; métricas continuam contando sem avançá-la.
- Escritores mapeados: atualizarLP (inclui reassociação), publicação/DELETE,
  análise SEO, geração SEO e desvinculação de rascunhos ao excluir domínio.
  Criação usa default; não há mudança em migrations anteriores.
- Publicação compara revisão e distingue LP_EDIT_CONFLICT de remoção; escrita
  final/DELETE usam CAS. Transações P2034 são repetidas no máximo 3 vezes,
  com todas as rechecagens; upload fica fora do retry.
- Limpeza consulta o banco antes de remover Blob: referência adotada ou banco
  indisponível impedem deleção em resultado desconhecido do commit.
- Arquivos: schema/migration, lp-transaction.ts, lp.ts, domains.ts, publicar,
  seo e gerar; testes lp-publicar ampliados. Generate e TypeScript passaram;
  testes focados de publicação/snapshot/edição/exclusão/E2E: 22/22 passaram
  antes dos cenários adicionais de corrida simultânea e DELETE.
- Docker CLI disponível, daemon Linux indisponível (pipe ausente). Concorrência
  PostgreSQL descartável permanece pendente; não foi usado banco de produção.
- Próximo passo: etapa 3, contrato de recuperação de notificação.

## Etapa 3 — recuperação de e-mail

- Endpoint usa serviço tenant-scoped e contrato explícito: aceite/já aceito (200),
  fila/processamento/retry (202), configuração pendente (422), final/ambíguo (409).
  `ok` e providerAccepted só confirmam aceite, nunca entrega na caixa.
- config_pending pode voltar à fila atomicamente sem zerar contador/firstAttemptAt
  ou trocar payload/chave. Janela vencida vira ambiguous; limite esgotado exige
  revisão. A API não aceita flag de reenvio cego; intervenção continua operacional.
- Arquivos: email-service.ts, lead-notification-contract.ts, resend/route.ts,
  lead-recovery-api.test.ts. Recuperação + notificação: 16/16 passaram com serviços
  reais e fetch/Prisma/auth simulados; TypeScript passou.
- Cobertos estados, permissões/tenant, recuperação após configuração, janela/limite,
  cliques concorrentes, disputa com worker, chave e provider ID. Nenhum e-mail real.
- Adicionais etapa 2: 16/16 testes publicar passaram, incluindo duas publicações
  concorrentes e conflito editorial no DELETE.
- Próximo passo: etapa 4, interface coerente com o contrato.

## Etapa 4 — interface

- Badges, explicação e ações derivam do contrato real; envio aceito não é tratado
  como confirmação de entrega. sending/retry/final/ambiguous não permitem clique
  de reenvio. config_pending oferece recuperação depois da configuração.
- Ref síncrona impede cliques duplicados antes do próximo render; durante a ação,
  botões ficam bloqueados. Respostas 202/409/422 exibem o resultado correto.
- Arquivos: LeadsCrmView.tsx, LeadNotificationCells.tsx,
  lead-notification-contract.ts, lead-notification-ui.test.ts.
- Teste de componentes reais renderizados e feedback: 2/2 passaram; tsc passou.
  Navegador interativo na VM permanece pendente.
- Próximo passo: etapa 5, auditoria e atualização focada de dependências.

## Etapa 5 — dependências

- Auditoria real npm de produção antes: 4 pacotes afetados (1 critical Next,
  1 high Zod, 2 low DOMPurify/Monaco). JSON integral em
  lp-finalization-audit-before.json. A primeira tentativa no sandbox falhou DNS;
  repetida com permissão de rede, sem esconder falha ou usar audit fix --force.
- Next/eslint-config-next 16.4.0 → 16.4.6, versões exatas alinhadas.
  Zod transitivo 4.6.5 → 4.6.7 por npm update dentro dos ranges já aceitos;
  para Next/Zod, nenhum upgrade de SDK/major nem override foi necessário.
- Comandos: `npm install --save-exact next@16.4.6 eslint-config-next@16.4.6 --ignore-scripts --no-audit`,
  `npm update zod --ignore-scripts --no-audit`, `npm audit --omit=dev --json`,
  `npm ls next eslint-config-next dompurify zod monaco-editor --all`.
- Resultado intermediário: 0 critical/high/moderate, 2 low depois de Next/Zod.
  A revisão adicional abaixo concluiu a correção de Monaco e substitui esse resultado.
- Causa adicional: Monaco stable 0.57.0 contém DOMPurify 3.4.15 embutido,
  inclusive no arquivo ESM. Último stable confirmado no registry continua 0.57.0;
  apenas a prerelease oficial 0.58.0-dev-20261111 declara e embute DOMPurify 3.4.17.
  O loader do wrapper ainda carregava CDN 0.55.1, independente do lockfile.
- Correção adicional: monaco-editor direto fixado exatamente nesse snapshot e
  loader CDN configurado pela mesma constante. Um override limitado ao peer
  monaco-editor de @monaco-editor/react referencia a dependência direta: necessário
  porque o range do wrapper exclui prereleases por SemVer, embora suas APIs sejam
  compatíveis. Não é um override cosmético do sanitizer: o código embutido também mudou.
- Validação: `npm ci --ignore-scripts --no-audit` passou; npm ls sem peer inválido;
  header ESM confirma DOMPurify 3.4.17; assets CDN loader.js/editor.main.js retornam
  HTTP 200. `PLAYWRIGHT_CHANNEL=msedge node scripts/smoke-monaco.mjs` passou em
  navegador real headless local (criar/renderizar/editar HTML/Markdown/dispose,
  sem pageerrors). Teste unitário verifica pacote/constante/loader/sanitizer.
- **Resultado final: 0 vulnerabilidades reportadas em produção**, todos os níveis,
  em lp-finalization-audit-after.json. Risco residual: snapshot Monaco é prerelease;
  validar editor integrado na VM e trocar por stable corrigido quando disponível.
- Fontes oficiais consultadas: release Next
  https://github.com/vercel/next.js/releases/tag/v16.4.6 ; advisories
  GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r, GHSA-673q-mjm6-r5xr,
  GHSA-mfr8-8qww-v76h, GHSA-vc7v-qv4w-wrv8 (Next),
  https://github.com/advisories/GHSA-mrhx-c7xc-m3w5 (Zod),
  https://github.com/microsoft/monaco-editor/issues/5517 e
  https://github.com/advisories/GHSA-c6gr-qvv4-5v3f (sanitizer).
- Arquivos: package.json/package-lock.json, monaco-runtime.ts, claude/page.tsx,
  smoke-monaco.mjs, monaco-runtime.test.ts. Próximo passo: etapa 6, regressão
  consolidada, build e validação incremental de migration.

## Etapa 6 — regressão consolidada

- `prisma generate` e `prisma validate`: passaram (Prisma 6.5.0).
- `node --import tsx --test tests/*.test.ts`: **94/94 passaram**, 13 suites;
  log lp-finalization-tests.log. Implementações reais com fronteiras simuladas;
  componentes de estado renderizados com React DOM, sem homologação de navegador.
- `npx tsc --noEmit --pretty false`: passou.
- `npm run build` com Next 16.4.6: **passou**, Turbopack, 51 páginas geradas;
  executado no Windows fora do sandbox para acesso às dependências/fontes.
  Log lp-finalization-build.log. Build não prova funcionamento da VM.
- Diff Prisma entre schema do HEAD e atual gera exclusivamente ADD COLUMN
  editorialRevision INTEGER NOT NULL DEFAULT 0, compatível com a migration nova.
  Nenhuma migration histórica alterada.
- PostgreSQL/Redis isolados não disponíveis: Docker Linux sem daemon; não há
  postgres/initdb/psql instalados; WSL não instalado. Migration aplicada e testes
  de concorrência PostgreSQL reais ficam pendentes, sem tocar banco existente.
- Lint dos arquivos alterados: duas falhas `set-state-in-effect`, em LeadsCrmView
  e claude/page, já presentes no HEAD e comprovadas por lint dos conteúdos originais
  via stdin (logs baseline). Nenhum disable global; zero erros novos/zero warnings.
- Auditoria final de produção: zero alertas reportados, conforme etapa 5 revisada.
- Legados sem publishedMetadata continuam servindo só as tags históricas do Blob
  até republicação explícita. E-mails históricos para revisão não são reenviados
  em massa. Scripts anteriores de operação permanecem disponíveis.
- Próximo passo: etapa 7, roteiro GoDaddy/VM com DNS atual e gate de homologação.

## Etapa 7 — GoDaddy/VM

- Roteiro atualizado em LP-HOSTING-VM-RUNBOOK.md: conferir NS antes de editar,
  cadastrar lp.garapalabs.com no tenant, copiar o token real e adicionar A/TXT
  apenas nesse hostname. Contrato confirmado em domains.ts: nome relativo
  `_stage-verify.lp`, FQDN `_stage-verify.lp.garapalabs.com`.
- Consulta DNS pública, sem mutação: NS=ns37/ns38.domaincontrol.com;
  A/AAAA de lp.garapalabs.com e TXT de _stage-verify.lp.garapalabs.com: ENOTFOUND.
  Conferir novamente no dia do deploy. Zona GoDaddy indicada pelos NS atuais;
  ausência de registros é pendência operacional, não falha do aplicativo.
- Documentação oficial GoDaddy de A/TXT/gestão DNS consultada. Nenhum token,
  cadastro, domínio secundário, remetente ou destinatário foi inventado.
- Roteiro cobre ambas as topologias, caddy:443 / host.docker.internal:443,
  listener e backend privado, ask interno antes da primeira LP, backup/build/
  migrations/health/logs, certificados persistentes e rollback sem remover colunas.
- Configs efetivas dos dois Compose passaram novamente em config --quiet.
- `git diff --check` passou; nenhuma migration histórica aparece no diff.
- Homologação cobre visitas durante republicação/DELETE, conflito editorial,
  snapshot, imagens/Blob privado, leads, estados de notificação, TLS/SNI/404,
  redirect com query, endpoints internos, cache antigo e dois tenants. Segundo
  hostname e domínio do segundo tenant são pré-requisitos ainda não provisionados.
- Limites B2s dependem de medição; SPF/DKIM exigem registros reais da Resend,
  independentes do A/TXT da LP. Envio real só para destinatário autorizado.

## Fechamento e próximos passos

| Item | Resultado | Evidência / limite |
|---|---|---|
| HTML completo/fragmentos | corrigido e validado localmente | Conversor e POST reais; storage/banco simulados |
| Visitas vs publicação/DELETE | corrigido e validado localmente | Revisão/CAS/retry; PostgreSQL real pendente |
| Recuperação API/CRM | corrigido e validado localmente | Estados, autorização, corrida e render de componentes |
| Dependências | audit produção sem alertas reportados | Npm real; Monaco prerelease pinado é risco residual explícito |
| Editor Monaco | smoke em navegador real local passou | Edge headless, assets locais; editor completo na VM pendente |
| DNS | consultado em infraestrutura pública real | NS GoDaddy; registros de teste ausentes; nenhuma alteração |
| Infraestrutura VM | pendente de homologação | Sem deploy, SSH, alterações DNS/provedor ou envio real |

Validações adicionais depois de npm ci/Monaco: cliente Prisma foi regenerado com
permissão de rede após uma tentativa no sandbox falhar DNS binaries.prisma.sh;
essa falta intermediária do cliente gerou falhas derivadas em testes/build e foi
resolvida antes dos resultados finais. Build final/TSC passaram. Nova conferência
focada de notificação/API/Monaco: 17/17 passaram, incluindo queued/failed legado e
recuperação com payload/firstAttemptAt já congelados, sem reset. Não se tratou falha
de configuração do ambiente como aprovação dos testes.

Arquivos relevantes desta execução:

- HTML: brand-assets.ts, render.ts, brand-assets-authorization.test.ts.
- Revisão editorial: schema.prisma, migration nova
  `20261118200000_lp_editorial_revision`, lp-transaction.ts, lp.ts, domains.ts,
  publicar/route.ts, seo/route.ts, gerar/route.ts, lp-publicar.test.ts.
- Recuperação: email-service.ts, leads/[id]/resend/route.ts,
  lead-notification-contract.ts, LeadsCrmView.tsx, LeadNotificationCells.tsx,
  lead-recovery-api.test.ts, lead-notification-ui.test.ts.
- Dependências/runtime: package.json/lockfile, monaco-runtime.ts, claude/page.tsx,
  scripts/smoke-monaco.mjs e monaco-runtime.test.ts.
- Documentação: este checkpoint, roteiro VM, referência na auditoria anterior,
  documentos da área em sistema/docs e CHANGELOG/DEPLOY.

Aplicação de migrations: manter as migrations históricas lease → idempotência →
publishedMetadata e aplicar editorialRevision por último via prisma migrate deploy.
Backup e parada dos produtores/consumidores antes da alteração, conforme roteiro.
Não executar reset/db push nem remover volumes. Legados de e-mail exigem revisão;
legados de LP sem envelope exigem republicação explícita de tags adicionais.

O commit histórico 9433365e6ac7d63329ab0d06692cb737a618936e não está presente neste
checkout (`git cat-file -t` falhou). HEAD examinado permanece e9686d760d8993a66a5aeacd81bb3c0ef695984e,
branch master e remoto Bitbucket, sem troca de remoto, checkout destrutivo, commit
ou push. Alterações locais são somente desta execução (base inicialmente limpa).
Fonte de verdade da finalização: este documento. Resultados anteriores de build,
auditoria e progresso não substituem os resultados finais registrados aqui.

## Recuperação de migration solicitada em 19/11/2026

Após o pedido explícito para executar/corrigir a migration, foi acessado o banco
configurado no ambiente local (Azure PostgreSQL, schema `fks-stage`). Esta ação
posterior não é homologação da VM e substitui apenas o registro anterior de que
nenhuma migration real havia sido aplicada nesta execução.

- CLI/client locais confirmados: Prisma 6.5.0. Na raiz não existe package.json;
  comandos npm com `--prefix sistema` usam a CLI local em vez de baixar Prisma 8.
- Causa comprovada: migration histórica `20261113030000_lead_email_outbox` já
  havia criado emailLeaseUntil, emailNextAttemptAt, emailLastError,
  emailFirstAttemptAt e emailProviderId. A migration local de lease falhou com
  PostgreSQL 42701; a de idempotência também teria colunas sobrepostas.
- Histórico contém outras cinco migrations de 13/11 ausentes deste checkout.
  Nenhuma delas foi apagada ou alterada. Os originais devem ser recuperados da
  fonte correspondente caso seja necessário reconstruir integralmente esse banco.
- Antes: 0 leads. Registro de metadados/histórico em
  `lp-migration-recovery-before.json`, sem credenciais ou conteúdo de registros.
- Preparado SQL de recuperação separado em
  `sistema/prisma/repairs/20261119_reconcile_lead_outbox.sql`; migrations históricas
  não foram editadas. O reparo usa transação, lock curto, validação de tipos e
  IF NOT EXISTS; aborta se houver leads, para não reinterpretar outbox antigo
  com dados. Não é uma migration automática nem reparo genérico para qualquer banco.
- Executado com CLI 6.5.0: `prisma db execute --schema prisma/schema.prisma --file
  prisma/repairs/20261119_reconcile_lead_outbox.sql`. Passou. Verificadas no
  PostgreSQL real as 8 colunas, tipos/nullability/default/precisão e índice.
- Somente depois da verificação: `prisma migrate resolve --applied
  20261118190000_lead_delivery_lease` e `--applied
  20261118191000_lead_provider_idempotency`. Não se marcou SQL incompleto como aplicado.
- `prisma migrate deploy` aplicou normalmente publishedMetadata e editorialRevision.
- Depois: 8 migrations locais aplicadas, 0 falhas ativas, 0 leads, checksums de
  migrations anteriores concluídas preservados. Registro em
  `lp-migration-recovery-after.json`. `npm run db:migrate:status` retornou exit 0,
  **Database schema is up to date!**.
- Novos scripts em package.json: `db:migrate:deploy` / `db:migrate:status`.
  A partir da raiz: `npm --prefix sistema run db:migrate:deploy` ou `:status`.
- Não houve reset, DROP, exclusão de dados/volumes, mudança de `.env`, atualização
  de major Prisma, envio de e-mail, deploy ou alteração de VM/DNS. Teste relevante
  foi a execução/verificação real da recuperação; nenhuma função da aplicação mudou.
