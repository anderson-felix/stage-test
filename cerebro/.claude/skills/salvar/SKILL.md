---
name: salvar
description: >
  Guarda o trabalho no GitHub: confere o que mudou, faz o commit com uma mensagem que diga o que
  foi feito e envia. Na primeira vez, cria o repositório privado. Use quando o usuário disser
  "salvar", "salva no GitHub", "commit", "sobe", "/salvar".
---

# /salvar

## Conferências (sempre)

0. Seguir as conferências da skill `protecao-git`.
1. `git rev-parse --is-inside-work-tree` para saber se a pasta já é um repositório.
2. Se já for: `git remote -v`. O remoto tem que ser o repositório **deste** workspace.
   - Se o `origin` aponta para o repositório do TatuOS (a pasta foi clonada de lá): explicar que o
     trabalho não pode ir para lá e oferecer renomear esse remoto para `tatuos`
     (`git remote rename origin tatuos`). Com o "sim", seguir para "Primeira vez" a partir do
     passo 2.
   - Se aponta para qualquer outro lugar que não pareça deste workspace: parar e avisar.
3. Conferir que `_privado/` e `entrada/` estão no `.gitignore` e não aparecem no `git status`.

## Primeira vez

1. `git init` e `git branch -M main`.
2. Conferir se o GitHub CLI está disponível (`gh auth status`). Sem ele, explicar em duas linhas
   como instalar e autenticar, e parar.
3. Propor o nome do repositório (o nome da pasta) e **confirmar com o usuário** antes de criar.
   Sempre privado: `gh repo create <nome> --private --source . --remote origin`.
4. Primeiro commit: `TatuOS instalado: [nome do negócio]`. Push com `git push -u origin main`.

## Das próximas vezes

1. `git status --short`. Se não houver mudança, dizer "Nada novo para salvar" e parar.
2. Agrupar o que mudou por pasta e escrever a mensagem do commit em português, dizendo o que foi
   feito e não quais arquivos mudaram. Ex.: `Campanha de Natal: e-mail e 3 posts aprovados`.
3. Se aparecer algo que parece trabalho pela metade ou arquivo grande (acima de 20 MB), mostrar e
   perguntar antes de incluir.
4. `git add` do que vai, `git commit`, `git push`.

## Nunca

- `--force`, `reset --hard`, reescrever histórico ou apagar branch.
- Commitar senha, token ou arquivo `.env`. Se aparecer, parar e avisar.
- Se o push for recusado por divergência: avisar e oferecer `git pull --rebase`. Não resolver
  conflito sem mostrar ao usuário.

## Resposta

Uma linha: `Salvo · [hash curto] · [mensagem do commit]`.
