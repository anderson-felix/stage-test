<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Documentação do sistema

Antes de mudar o produto, ler o documento da área em `docs/`: `PRD.md` (requisitos por Módulo), `TRD.md` (arquitetura), `APP-FLOW.md` (telas e fluxos), `DESIGN-SYSTEM.md` (UI do hub), `BACKEND.md` (rotas e esquema de arquivos), `PLANO.md` (fases e etapas). Toda mudança relevante atualiza esses documentos e o `docs/CHANGELOG.md`. Decisões difíceis de reverter viram ADR em `docs/adr/`. Termos do domínio seguem `GLOSSARY.md`.

## Agent skills

### Issue tracker

Issues e specs ficam no GitHub Issues de `tatucotech/stage-hub` (via `gh`). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `GLOSSARY.md` na raiz + `docs/adr/`. See `docs/agents/domain.md`.

## Armadilha conhecida: rotas da API com código antigo no `next dev`

Ao adicionar uma função nova num módulo de `src/lib/` já importado por uma rota da API, o Turbopack às vezes continua servindo a versão antiga só para as rotas (`... is not a function`), enquanto as páginas pegam a nova. `touch` não resolve: reiniciar o `npm run dev`.

## Fechamento do dia

Quando o usuário encerrar o dia ("fechar o dia", "encerrar", "/salvar") ou na última tarefa do dia: atualizar toda a documentação com o que evoluiu (`docs/CHANGELOG.md`, `GLOSSARY.md`, ADRs novas ou substituídas, PRD/TRD/APP-FLOW/DESIGN-SYSTEM/BACKEND/PLANO) e fazer commit + push nos dois repositórios: `tatucotech/stage-hub` e `tatucotech/stage-mkt` (o workspace). Se o dia terminar sem o pedido, oferecer antes de encerrar. Pastas não versionadas criadas pelo usuário (ex.: Pautas de teste) só entram no commit com o aval dele.

## Ambiente de quem opera

- Hoje o hub roda só na máquina do usuário (`npm run dev`, porta 3100), com o login pessoal dele no Claude Code. O `.env.local` (`HUB_PASSWORD`, `HUB_SECRET`, `WORKSPACE_DIR`, `SITE_URL`) e a pasta `data/` (usuários) não vão para o git: recriar em cada máquina ou servidor.
- No servidor (fase 5), o Claude usa `ANTHROPIC_API_KEY` da empresa no lugar do login pessoal. Passo a passo em `docs/DEPLOY.md`.
- Testes de ponta a ponta que criam usuários devem apagar `data/usuarios.json` no fim, para o primeiro acesso real continuar com o usuário.
