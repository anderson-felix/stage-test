---
name: carrossel
description: >
  Cria carrosséis e posts de imagem para Instagram e LinkedIn na identidade da marca: roteiro das
  telas, montagem em HTML, PNGs no tamanho do canal e legenda pronta. Use quando o usuário disser
  "carrossel", "post para o Instagram", "post para o LinkedIn", "faz umas telas sobre",
  "/carrossel".
---

# /carrossel

Um carrossel bom tem **uma ideia** e cada tela empurra para a próxima. Primeiro o roteiro, depois
o visual: mudar texto no roteiro custa nada, mudar depois de renderizado custa uma rodada.

> **Stage Hub:** se o pedido cita um Post de `marketing/social/`, seguir só o `modo-hub.md`
> desta pasta (o hub renderiza os PNGs; aqui só se escreve o HTML).

## 1. Entender o pedido

Ler `contexto/voz.md`, `contexto/foco.md`, `marca/guia-visual.md` e `marca/canais.md`.

Se o pedido não deixar claro, perguntar (uma coisa por vez, com sugestão):
- **A ideia central** em uma frase. Se o usuário trouxe só um assunto ("fala de retenção"),
  propor 3 ângulos e deixar escolher.
- **O canal:** Instagram (1080 × 1350) ou LinkedIn (1080 × 1350 também funciona; 1200 × 1500 se
  o usuário preferir).
- **O que a pessoa deve fazer no fim:** comentar, salvar, clicar no link da bio, agendar.

## 2. Roteiro (aprovar antes do visual)

Entre 5 e 10 telas. Mostrar em tabela:

| Tela | Modelo | Texto |
|---|---|---|
| 1 | abertura | [a promessa: o que a pessoa ganha se arrastar] |
| 2–N | ponto · dado · frase | [uma ideia por tela, frase curta] |
| última | chamada | [a ação, uma só] |

Regras do texto:
- Tela 1 com no máximo 12 palavras. Ela decide se a pessoa arrasta.
- Uma ideia por tela; até 30 palavras fora a tela de abertura.
- Número só com fonte. Sem fonte, a tela `dado` não entra.
- No tom de `contexto/voz.md`.

Esperar o "ok" do usuário ou os ajustes.

## 3. Montar

1. Criar a pasta `entregas/posts/AAAA-MM-DD-tema-curto/`.
2. Copiar `.claude/skills/carrossel/base.html` para lá como `carrossel.html`.
3. Trocar as variáveis de `:root` pelas cores e fontes de `marca/guia-visual.md`. Fonte que não
   está no Google Fonts: perguntar se o arquivo está em `marca/` e carregar com `@font-face`.
4. Apagar as telas de exemplo e montar as do roteiro com os modelos da base: `abertura`, `ponto`,
   `dado`, `frase`, `chamada`. Modelo novo pode ser criado no próprio arquivo, seguindo a marca.
5. Logo: se houver em `marca/`, colocar no rodapé da abertura e da chamada.
6. Ajustar `--largura` e `--altura` se o canal pedir outro tamanho.

## 4. Renderizar e conferir

```
node ferramentas/renderizar.mjs entregas/posts/<pasta>/carrossel.html 1080 1350
```

- Na primeira vez, se faltar o Playwright: `npm install` na raiz e `npx playwright install chromium`.
- **Abrir pelo menos a primeira e a última tela** para conferir: texto cortado, sobra de espaço,
  contraste, acento quebrado. Corrigir e renderizar de novo antes de mostrar ao usuário.

## 5. Legenda

Salvar `legenda.md` na mesma pasta:
- Primeira linha que funcione sozinha (é o que aparece antes do "mais").
- 3 a 6 linhas curtas que completam o carrossel, sem repetir as telas.
- A mesma chamada da última tela.
- Hashtags: de 3 a 5, específicas, só no Instagram. No LinkedIn, no máximo 3.
- Texto alternativo de cada tela, para acessibilidade.

## Entrega

```
Carrossel pronto · N telas · [canal]
Pasta: entregas/posts/<pasta>/  (tela-01.png … tela-NN.png, legenda.md)
Próximo passo: /aprovar-post para conferir e publicar
```
