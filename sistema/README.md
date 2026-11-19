# Stage Hub

Central web do marketing da Stage Consulting. Junta num lugar só o Claude (com a
memória, a identidade e as skills da pasta `../cerebro/`), o site, as
redes sociais e as campanhas.

## Rodando

```bash
cp .env.example .env.local   # preencha chave de instalação, segredo e WORKSPACE_DIR
npm install
npm run dev                  # http://localhost:3100
```

No primeiro acesso, o login pede a chave de instalação (`HUB_PASSWORD`) e cria o administrador. Os demais usuários são criados na tela **Usuários**. Para o servidor, ver [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Como o Claude funciona aqui

O hub roda o Claude Code em modo headless (`claude -p --output-format stream-json`)
dentro de `WORKSPACE_DIR`. Assim ele carrega o `CLAUDE.md`, o `contexto/`, a
`marca/` e as skills de `.claude/skills/` sem nada duplicado.

- **Autenticação:** usa o login local do Claude Code. Quando `ANTHROPIC_API_KEY`
  estiver definida, a cobrança passa a ser pela API. Isso é obrigatório antes de
  hospedar o hub para o time.
- **Ferramentas liberadas:** Read, Edit, Write, Glob, Grep, WebSearch, WebFetch e Skill.
  Terminal (Bash) bloqueado: nada de rodar comandos ou fazer deploy pelo hub.
- **Conversas:** cada chat guarda o `session_id` e continua com `--resume`.

## Estrutura

| Caminho | O que é |
|---|---|
| `src/proxy.ts` | Exige login em todas as páginas e APIs; senha provisória e área de admin |
| `src/lib/usuarios.ts` | Cadastro de usuários (arquivo em `DATA_DIR`, senha scrypt) |
| `src/lib/claude.ts` | Ponte com o Claude Code (spawn + eventos normalizados) |
| `src/lib/workspace.ts` | Leitura/escrita segura dentro do workspace |
| `src/app/api/*` | `login`, `chat` (NDJSON), `files`, `status` |
| `src/app/(hub)/` | Abas: Visão Geral, Site & LPs, Social, Tráfego & Leads, Claude Code |

## Documentação

PRD, TRD, App Flow, Design System, Backend e Plano de Implementação ficam em [`docs/`](docs/). Decisões em [`docs/adr/`](docs/adr/), termos em [`GLOSSARY.md`](GLOSSARY.md).
