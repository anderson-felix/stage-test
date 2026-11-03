---
name: escrever-spec
description: >
  Escreve a especificação de uma funcionalidade, sistema ou processo antes de construir: o
  problema, quem usa, o que entra no escopo e o que fica fora, como funciona, regras, casos de
  borda e como saber que ficou pronto. Use quando o usuário disser "escreve a spec", "especifica
  isso", "documenta antes de fazer", "o que precisa ter essa tela", "/escrever-spec", ou depois de
  uma /sabatina.
---

# /escrever-spec

A spec é o combinado. Ela existe para que quem constrói, quem aprova e quem usa estejam falando
da mesma coisa antes de o trabalho começar, quando mudar ainda é barato.

## 1. Partir do que já existe

- Se acabou de rolar uma `/sabatina` sobre o assunto, usar as decisões dela.
- Ler `contexto/glossario.md`, `contexto/regras.md`, `decisoes/` e, em software, o código e as
  specs existentes da área afetada.
- Se faltar muita coisa (o problema não está claro, ninguém sabe quem usa), sugerir uma
  `/sabatina` primeiro em vez de escrever no escuro.

## 2. Escrever

Onde salvar: `projetos/<projeto>/specs/` se for de um projeto; senão `entregas/specs/`.
Nome: `AAAA-MM-DD-nome-curto.md`.

```markdown
# [Nome] — spec

- **Situação:** rascunho · aprovada em DD/MM por [quem] · em construção · entregue
- **Autor:** … · **Aprova:** …

## Problema
[O que está ruim hoje, para quem, com número se houver.]

## Objetivo
[O que muda quando estiver pronto. Como vamos medir.]

## Quem usa
[Perfis e o que cada um precisa fazer.]

## Escopo
**Entra:** …
**Fica de fora (por agora):** …

## Como funciona
[O fluxo passo a passo, do ponto de vista de quem usa. Telas, mensagens, dados que entram e saem.]

## Regras
[Os critérios, com link para contexto/regras.md quando já existirem.]

## Casos de borda
| Situação | O que acontece |

## Pronto quando
- [ ] [critério verificável]

## Perguntas em aberto
- [pergunta] — [quem responde] · [até quando]
```

Regras da escrita:
- Os termos do glossário, sempre com o mesmo nome. Termo novo vai para o glossário.
- "Pronto quando" com critérios que dá para conferir: "o relatório abre em menos de 3 segundos",
  não "o relatório é rápido".
- O que foi decidido fora da spec (numa conversa, numa reunião) entra com a data e quem decidiu.

## 3. Revisar

Mostrar ao usuário o resumo (problema, escopo, o que fica de fora, perguntas em aberto) e ajustar.
Spec aprovada muda a situação para `aprovada em DD/MM por [quem]`.

## Resposta

```
Spec: [caminho] · [situação]
Escopo: N itens · fora: N · perguntas em aberto: N
Próximo passo: /quebrar-tarefas para dividir em entregas
```
