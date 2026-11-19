---
name: quebrar-tarefas
description: >
  Divide uma spec ou um plano em tarefas do tamanho de uma sessão de trabalho, cada uma com o que
  entra, como saber que ficou pronta e do que depende, na ordem certa para construir. Use quando o
  usuário disser "quebra em tarefas", "divide isso", "por onde começo", "planeja a próxima etapa",
  "/quebrar-tarefas".
---

# /quebrar-tarefas

Tarefa grande demais nunca termina; pequena demais vira burocracia. O tamanho certo é o que cabe
numa sessão de trabalho focado (meio dia) e entrega algo que dá para ver funcionando.

## 1. O que quebrar

- Uma spec (`entregas/specs/` ou `projetos/<projeto>/specs/`), um item de `contexto/foco.md` ou
  um plano que o usuário descreveu.
- Ler a spec inteira, as regras e decisões citadas e, em software, o código da área afetada para
  saber o que já existe.
- Spec com perguntas em aberto que afetam a ordem: listar quais e perguntar se segue assim mesmo.

## 2. Montar as tarefas

Princípios:
- **Fatia vertical:** cada tarefa entrega algo que funciona de ponta a ponta, mesmo que simples
  (uma tela que já salva no banco, e não "fazer todas as telas" e depois "fazer o banco").
- **Primeiro o que destrava** o resto e o que tem mais risco de dar errado.
- **Uma sessão cada.** Se não cabe, quebrar de novo.
- **Pronto verificável:** cada tarefa tem como ser conferida por quem não a fez.

Para cada tarefa:

```markdown
## NN · [Título que diz o resultado]

- **Depende de:** [tarefas] · ou: nada
- **Tamanho:** 1 sessão · ½ sessão
- **Entra:** …
- **Não entra:** …
- **Pronto quando:**
  - [ ] …
- **Arquivos ou áreas afetadas:** …
```

## 3. Revisar com o usuário

Mostrar a lista em tabela (número, título, depende de, tamanho) com o total de sessões. Ajustar a
ordem e o corte conforme o usuário.

## 4. Salvar

- Na pasta da spec: `tarefas.md` com todas as tarefas, na ordem.
- Se houver `_privado/progresso.md`, oferecer acrescentar as tarefas como itens, com o tamanho
  como peso.
- Se o usuário usa um quadro de tarefas (Trello, Planner, GitHub Issues), entregar as tarefas no
  formato para colar ou, com a ferramenta disponível e o "ok" dele, criar lá.

## Resposta

```
N tarefas · N sessões no total
Ordem: 01 → 02 → …
Começar por: 01 · [título]
Arquivo: [caminho]/tarefas.md
```
