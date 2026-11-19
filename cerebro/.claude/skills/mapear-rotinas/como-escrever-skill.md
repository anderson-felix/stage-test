# Como escrever uma skill do TatuOS

## Formato

```markdown
---
name: nome-da-skill
description: >
  O que ela faz em uma frase, o que entrega e quando usar. Termina com as frases que disparam:
  "…", "…", "/nome-da-skill".
---

# /nome-da-skill

[Uma ou duas frases: por que esta tarefa existe e o que é um bom resultado.]

## 1. [Primeiro passo]
## 2. …

## Resposta
[o formato curto da mensagem final, num bloco de código]
```

## Regras

- **Nome** em português, minúsculo, com hífen, curto: `fechamento-mensal`, `proposta-cliente`.
- **A descrição decide quando a skill é usada.** Colocar as palavras que o usuário diz de
  verdade, não as técnicas.
- **Passos numerados**, cada um com uma ação clara. Se um passo tem mais de 8 linhas, quebrar em
  dois.
- **Dizer onde ler e onde salvar**, com o caminho: `contexto/voz.md`, `entregas/<tipo>/...`.
- **Pontos de parada explícitos:** "mostrar e esperar o ok" antes de qualquer coisa que gaste
  dinheiro, publique, envie ou apague.
- **Uma pergunta por vez**, sempre com uma resposta sugerida.
- **Não inventar dado.** Se a informação não está nos arquivos, a skill pergunta.
- **Modelo de saída** num bloco de código, para o resultado sair igual toda vez.
- Arquivo de apoio (modelo, lista, script) fica na pasta da própria skill e é citado no texto.
- Até umas 120 linhas. Skill longa demais é sinal de que são duas.
