---
name: roteiro
description: >
  Escreve o Roteiro e a Legenda dos Posts de uma Pauta (Instagram e LinkedIn) e grava em
  marketing/social/. Também sugere Pautas a partir da estratégia. Use quando o usuário pedir
  "roteiro", "nova pauta", "roteiro pro designer", "sugerir pautas", "ideias de post", ou /roteiro.
---

# /roteiro — Pauta → Roteiro + Legenda por Post

Dois modos:
- **Criar** (padrão): recebe uma Pauta e grava os Posts em `marketing/social/`.
- **Sugerir**: quando o pedido for "sugerir pautas"/"ideias", propõe Pautas sem gravar nada.

O Stage Hub chama esta skill pelo botão Nova Pauta; ela também funciona direto no Claude Code.

## Antes de escrever

Ler, nesta ordem:
1. `contexto/negocio.md`, `contexto/voz.md`, `contexto/foco.md`
2. `marca/guia-visual.md` — principalmente "Padrões observados no feed" (Séries e elementos fixos)
3. `marca/series.md`, se existir — regras de cada Série
4. `marketing/social/README.md` — estrutura de pastas e valores aceitos

## Modo Criar

### Entrada

- **Tema** (obrigatório) e **ângulo** (se faltar, definir um a partir da estratégia)
- **Canais e Formatos**: lista de pares, ex.: instagram/carrossel, linkedin/post-unico
- **Pasta da Pauta**: quando vier do hub, usar exatamente a pasta informada. Senão, `marketing/social/<AAAA-MM-DD>-<slug>/` com a data planejada (ou hoje) e slug curto em minúsculas, sem acento
- **Data planejada** (opcional)

Formatos válidos: Instagram → carrossel, post-unico, story. LinkedIn → carrossel, post-unico. Pedido inválido (ex.: story no LinkedIn) → avisar e trocar por post-unico.

### Passo 1 — Pauta

Gravar `<pasta>/pauta.md`:

```markdown
---
titulo: "<título curto da Pauta>"
angulo: "<a tese em uma frase>"
objetivo: <autoridade | cultura | recrutamento | evento | institucional>
criada_em: <AAAA-MM-DD de hoje>
---
<2–3 frases de contexto: por que este tema, para quem, que conversa abre>
```

- `titulo` e `angulo` sempre entre aspas duplas (texto com `:` quebra o YAML e o hub mostra o Post como "fora do padrão"). Aspas dentro do texto: usar aspas simples ou “curvas”.

### Passo 2 — Série

Escolher a Série de cada Post: `cultura-em-acao` (valores e cultura interna), `dado` (um número forte), `na-midia` (matéria ou ranking), `socios` (pessoas da Stage), `evento` (foto de evento real), `conteudo` (tese/educativo; padrão). Séries `na-midia`, `socios` e `evento` dependem de material real (matéria, foto): só usar quando a entrada trouxer esse material.

### Passo 3 — Roteiro (um por Post)

Gravar `<pasta>/<canal>-<formato>/post.md`:

```markdown
---
canal: instagram
formato: carrossel
serie: conteudo
status: rascunho
data_planejada: 2026-10-14
origem_arte:
---
### Slide 1 — CAPA
Texto: "<texto final do slide, exatamente como vai na arte>"
Visual: <fundo, destaque, elemento gráfico da Biblioteca de assets>
```

- Deixar `data_planejada:` vazio quando não houver data.
- **Layouts** (mesmo vocabulário da `/carrossel`): CAPA, SOLO, DUO, NÚMERO, CITAÇÃO, CTA FINAL.
- **Carrossel**: 5 a 8 slides. Slide 1 CAPA (título de no máximo 8 palavras), miolo com pelo menos 2 Layouts diferentes, último CTA FINAL. Um insight por slide.
- **Post único**: 1 slide. **Story**: 1 a 3 telas, formato vertical.
- Alternar fundo claro / escuro entre slides seguidos.
- **Texto** é o texto final: frase curta, afirmativa, sem bullet. Cabe no slide sem apertar (até ~25 palavras no miolo).
- **Visual** orienta a Arte: fundo, onde vai o destaque do título, qual elemento gráfico.
- Dado numérico só com fonte. Sem fonte confirmada, escrever `Fonte: confirmar antes de publicar` logo abaixo do Visual.
- Quando a Pauta sai em mais de um Canal, adaptar: o LinkedIn pede mais contexto e tom de opinião; o Instagram, mais síntese.

### Passo 4 — Legenda (uma por Post)

Gravar `<pasta>/<canal>-<formato>/legenda.md`, pronta para colar:

- **Instagram**: hook na 1ª linha → 1–2 frases de contexto → convite para arrastar (carrossel) → assinatura "The new Stage of Consulting." → 5 a 10 hashtags.
- **LinkedIn**: abre com a tese → 2–3 parágrafos curtos com contraste e exemplo concreto → fecho que amarra em resultado ou relação de longo prazo → 3 a 5 hashtags.

### Passo 5 — Conferir

Done quando cada Post pedido tem `post.md` e `legenda.md`, todo `post.md` tem frontmatter com os seis campos e valores da lista aceita, e nenhum texto quebra as regras de `contexto/voz.md`.

Responder com uma linha por Post: caminho, Série escolhida e número de slides. Nada além disso.

## Modo Sugerir

Propor 5 Pautas alinhadas às frentes de `contexto/foco.md`, variando objetivo e Série. Não gravar arquivos.

Quando o pedido pedir JSON, responder **somente** um array JSON, sem texto em volta:

```json
[{"titulo": "...", "angulo": "...", "objetivo": "autoridade", "canais": [{"canal": "instagram", "formato": "carrossel"}], "serie": "conteudo", "porque": "<uma frase>"}]
```

Senão, listar em Markdown: título, ângulo, Canais/Formatos e por quê.

## Regras

- Tom de voz de `contexto/voz.md` em todo texto; o corpo é em português.
- Nunca inventar números, clientes, cases ou falas. Clientes citados só os que estão em `contexto/negocio.md`, e só como contexto, nunca como depoimento.
- Status inicial é sempre `rascunho`; quem aprova é o usuário.
- Esta skill não gera Arte: isso é da `/carrossel`, depois da aprovação.
