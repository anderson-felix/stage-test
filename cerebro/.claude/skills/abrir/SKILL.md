---
name: abrir
description: >
  Começa o dia de trabalho: carrega o contexto do negócio, registra a hora de início no diário,
  traz as pendências do último dia e mostra o placar (progresso, ritmo e as prioridades de hoje).
  Use quando o usuário disser "abrir", "bom dia", "começar o dia", "vamos começar", "/abrir".
---

# /abrir

O objetivo é sair desta resposta sabendo o que fazer primeiro.

## 1. Contexto

Ler `CLAUDE.md` e `contexto/` (negócio, voz, foco). Não listar o que foi lido.

## 2. Hora de início

- Pegar a hora local do sistema. No Windows, pelo PowerShell: `Get-Date -Format "yyyy-MM-dd HH:mm"`.
  O `date` do Git Bash pode devolver UTC.
- Se `diario/AAAA-MM-DD.md` não existe, criar:
  ```markdown
  # Diário — DD/MM/AAAA

  - **Início:** HH:MM · **Fim:** (preenchido pelo /encerrar)
  ```
- Se já existe (segunda abertura no dia), não mexer na hora de início.
- Se o diário do último dia útil ficou sem o `/encerrar` (sem hora de fim), avisar na resposta e
  oferecer fechar aquele dia primeiro.

## 3. Pendências

- Do diário anterior mais recente, a seção "Pendências e próximos passos", só o que está aberto.
- De `_privado/pendencias.md`, se existir, com o prefixo "(privado)".
- No máximo 3 na resposta, as mais urgentes.

## 4. Placar

Só se existir `_privado/progresso.md` (se `contexto/foco.md` tem prazo e o arquivo não existe,
oferecer criar a partir de `.claude/skills/encerrar/modelo-progresso.md`).

- **Ritmo:** avanço dos últimos 5 dias úteis contra o ritmo necessário (sessões restantes ÷ dias
  úteis até o prazo). Veredito: "no ritmo", "acima" ou "abaixo", com os números.
- **Prioridades de hoje:** até 3, por esta ordem de critério:
  1. o que o usuário disse que era prioridade no último dia;
  2. o que move mais peso do que falta;
  3. o que tem data próxima.
- **Risco:** só se um item obrigatório não começou e faltam menos de 10 dias úteis para a data
  dele.

Sem `progresso.md`, as prioridades saem de `contexto/foco.md` e das pendências.

## Resposta (até 16 linhas)

```
[Negócio] · [dia da semana, DD/MM]
Início registrado: HH:MM
Pendente: [até 3 itens, um por linha]

Progresso: XX% · [veredito do ritmo, com números]
Hoje:
1. [tarefa] — [o que move]
2. ...
Risco: [só se houver]

Por onde começamos?
```
