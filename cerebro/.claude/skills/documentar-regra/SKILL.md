---
name: documentar-regra
description: >
  Transforma uma regra de negócio que só existe na cabeça de alguém ou numa conversa solta em
  regra escrita, com exemplo, exceções e dono, em contexto/regras.md. Use quando o usuário disser
  "documenta essa regra", "formaliza isso", "isso precisa estar escrito", "/documentar-regra", ou
  quando uma regra importante for explicada na conversa sem estar em nenhum arquivo.
---

# /documentar-regra

Regra que não está escrita muda conforme quem lembra dela. Escrever é o que faz ela valer igual
para todo mundo, inclusive para o Claude.

## Quando oferecer sem ser chamado

Se na conversa aparecer um critério que decide algo ("cliente inativo é quem não compra há 6
meses", "desconto acima de 10% precisa do gerente"), e ele não está em `contexto/regras.md`,
oferecer numa linha: "Isso parece uma regra do negócio. Quer que eu documente?"

## 1. Entrevista

Uma pergunta por vez, com a resposta sugerida a partir do que já foi dito:
1. **A regra em uma frase**, do jeito que alguém novo entenderia.
2. **Para que ela existe:** o problema que evita ou o resultado que garante.
3. **Exemplo concreto:** um caso que a regra decide, com números.
4. **Exceções:** quando não vale, e quem pode abrir exceção.
5. **Dono:** quem decide se a regra muda.
6. **Onde ela age:** em que processo, sistema ou peça ela é aplicada.

Termo vago na resposta ("cliente ativo", "campanha grande") é fechado antes de seguir e vai para
`contexto/glossario.md`.

## 2. Escrever

Acrescentar em `contexto/regras.md`, na seção do assunto (criar a seção se não existir):

```markdown
### [A regra em uma frase]

- **Por quê:** …
- **Exemplo:** …
- **Exceções:** … (quem autoriza: …)
- **Onde se aplica:** …
- **Dono:** … · **Desde:** DD/MM/AAAA · **Decisão:** [link para decisoes/, se houver]
```

Mostrar a entrada antes de salvar.

## 3. Reflexos

- Procurar nos arquivos do workspace (skills, modelos, projetos) onde a regra deveria estar sendo
  aplicada e não está, ou onde algo a contradiz. Listar para o usuário.
- Se a regra **mudou** uma regra anterior, oferecer o `/registrar-decisao` para guardar o porquê.

## Resposta

```
Regra documentada: [frase] · contexto/regras.md › [seção]
Reflexos: [N lugares para ajustar · ou: nenhum]
```
