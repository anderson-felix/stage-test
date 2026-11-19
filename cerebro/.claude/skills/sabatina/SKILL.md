---
name: sabatina
description: >
  Testa um plano, uma ideia de produto, uma regra de negócio ou uma funcionalidade com perguntas,
  uma de cada vez, até não sobrar ponto em aberto, e atualiza a documentação (glossário e
  decisões) conforme cada ponto se resolve. Use quando o usuário disser "sabatina", "me sabatina",
  "testa esse plano", "me questiona", "acha os furos", "/sabatina", ou antes de escrever uma spec.
---

# /sabatina

Uma ideia só está pronta para virar trabalho quando cada escolha dela foi feita de propósito. A
sabatina percorre essas escolhas com o usuário, uma por uma, e deixa a documentação em dia no
caminho, para que a conversa não se perca.

## Preparar (antes da primeira pergunta)

1. Resumir o plano em 2 ou 3 linhas e pedir confirmação: "É isso que vamos testar?"
2. Ler o que já existe sobre o assunto: `contexto/glossario.md`, `decisoes/`, `contexto/foco.md`
   e, em projeto de software, os documentos de especificação e o código relevante.
3. Montar, sem mostrar, a **árvore de escolhas**: o que o plano precisa definir (quem usa, o que
   entra e o que sai, regras, exceções, dependências, como medir) e o que depende do quê. Começar
   pelas escolhas que destravam outras.

## Perguntar

- **Uma pergunta por mensagem.** Nunca uma lista.
- **Toda pergunta vem com a resposta recomendada** e o motivo em uma linha. O usuário confirma,
  corrige ou escolhe outra.
- **Se a resposta está nos arquivos ou no código, ir buscar** em vez de perguntar. Perguntar só o
  que depende de decisão do usuário.
- **Desafiar sem rodeio:** contradição com uma decisão registrada, caso de borda esquecido,
  escopo que cresceu, prazo que não fecha. Citar o arquivo da decisão quando houver.
- **Cobrar o termo exato.** Se o usuário usa uma palavra vaga ("cliente ativo", "campanha boa")
  ou dois nomes para a mesma coisa, parar e fechar o sentido antes de seguir.
- Resposta "não sei" ou "depende" vira **ponto em aberto**, com quem decide e até quando. Não
  travar a sabatina por causa dele.

## Documentar enquanto conversa

Sem esperar o fim:
- **Termo resolvido** → entra em `contexto/glossario.md` na hora (com o termo a evitar, se houver).
- **Decisão que muda como o negócio ou o sistema funciona** → propor o registro em `decisoes/`
  (modelo no README da pasta) e escrever depois do "sim".
- Avisar numa linha o que foi atualizado: "Glossário: 'cliente ativo' registrado."

## Terminar

Quando todos os ramos da árvore estão resolvidos ou marcados como abertos:

```
Sabatina encerrada · [assunto]
Decidido: [lista curta]
Em aberto: [ponto] — [quem decide] · [até quando]
Atualizado: glossário (+N termos) · decisões (N arquivos)
Próximo passo: [ex.: /escrever-spec, /quebrar-tarefas, começar a peça]
```

Se o usuário pedir para parar no meio, fazer o mesmo resumo com o que já foi coberto e o que
faltou.
