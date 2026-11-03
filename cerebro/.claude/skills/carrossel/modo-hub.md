<!-- Instância da Stage: usado quando o pedido cita um Post de marketing/social/ (vem do Stage Hub). -->

# Modo Hub (Post do Social)

O Roteiro já foi aprovado. O trabalho é transformá-lo em Arte. **Quem renderiza os PNGs é o hub**: aqui só se escreve o HTML. Sem terminal, sem `render.js`, sem `npx`.

## Ler antes

1. `<post>/post.md` — frontmatter (`canal`, `formato`, `serie`) e o Roteiro (`### Slide N — LAYOUT` + `Texto:` + `Visual:`)
2. `marca/guia-visual.md` — principalmente "Padrões observados no feed"
3. `marca/series.md` e `marca/assets/README.md`, se existirem
4. `<post>/arte/arte.html`, se existir e o pedido for um **ajuste**

## Gravar

Somente `<post>/arte/arte.html`. Não editar `post.md` nem `legenda.md`.

**Ajuste:** quando o pedido trouxer "Ajuste pedido: …", editar o `arte.html` existente aplicando só a mudança pedida; o resto fica igual.

**Edições feitas à mão no Editor de Arte do hub:** o `arte.html` pode trazer `style="..."` inline (`translate`, `width`, `height`, `font-size`, `color`, `background`, `z-index`, `opacity`), imagens com `position: absolute` e slides duplicados, reordenados ou apagados. Isso é decisão do usuário: num ajuste, preservar tudo isso e não "corrigir" de volta para o padrão, a menos que o pedido fale daquele elemento. Ao mexer num elemento que tem `translate` inline, manter o deslocamento.

## Contrato do HTML (o render do hub depende disso)

- Um único arquivo; cada slide é um `<section class="slide">`, na ordem do Roteiro, um por `### Slide`.
- Tamanho exato de cada slide: **1080×1350** (carrossel e post-unico) ou **1080×1920** (story). `width`/`height` fixos em px, `overflow: hidden`, `position: relative`.
- `body { margin: 0 }` e slides empilhados sem espaço entre eles.
- CSS todo num `<style>` no `<head>`. Única dependência externa permitida: Google Fonts. Nenhuma imagem da internet (o render bloqueia).
- Imagens locais por caminho relativo a partir de `arte/`. O logo:
  `../../../../../marca/assets/logo/Logotipo_Stage.png` (roxo, fundo transparente). Em fundo escuro, aplicar `filter: brightness(0) invert(1)` para deixá-lo branco.
- Elementos que ainda não estão em `marca/assets/` (renders 3D, texturas, ilustrações, selos) são **aproximados com CSS ou SVG inline**: gradientes roxos, formas fluidas com `radial-gradient` e `blur`, pattern de hexágonos em SVG, asterisco em SVG. Nunca simular foto de pessoa.

## Padrão visual da Stage (enquanto o designer não confirma)

- **Fonte:** Open Sans (Google Fonts), 400/600/700/800. Título 700–800.
- **Duas famílias, alternando slide a slide:**
  - **Clara:** fundo `#FFFFFF` ou `#F6F3FF`, título `#6D23F9`/`#4C0DFF`, corpo `#1C1B1E`.
  - **Escura:** gradiente `#21005E` → `#0B0420`, formas fluidas roxas (`#6200EE`, `#4C0DFF`) desfocadas, título branco.
- **Em todo slide:** eyebrow pequeno acima do título (UPPERCASE, 20–24px, letter-spacing 0.2em, roxo claro `#A98BFF` no escuro / `#6D23F9` no claro); logo no canto inferior esquerdo (altura ~44px); setas `▸▸` verde-água `#4FFBE5` no canto inferior direito (exceto no último slide).
- **Destaque no título:** a parte que o `Visual:` indicar vai em itálico ou em outra cor (`#A98BFF` no escuro, `#4C0DFF` no claro).
- **Tamanhos:** título de CAPA 96–112px; título interno 68–84px; corpo 32–38px (o Instagram é visto no celular). Line-height do título ~1.05, letter-spacing −0.02em. Margem de segurança 88px.
- **Layouts:** CAPA (título grande, ancorado embaixo ou no centro); SOLO (título + apoio, forma gráfica de um lado); DUO (dois blocos lado a lado, contraste); NÚMERO (numeral de 320–420px com gradiente roxo em `background-clip: text`); CITAÇÃO (aspas gigantes lilás em marca d'água); CTA FINAL (fundo `#4C0DFF`, logo branco centralizado, frase curta, @stage.consulting).
- **Acento gráfico:** asterisco/flor lilás `#EADDFF` e pattern de hexágonos cinza-claro `#F2F2F2` nos fundos claros.
- Sem emoji, sem clip-art, sem sombra pesada, no máximo uma cor de destaque por slide.

## Conferir (done)

Done quando: o número de `.slide` é igual ao número de `### Slide` do Roteiro; cada slide traz o `Texto:` **exatamente** como está no Roteiro; nenhum texto passa da margem de segurança (reduzir a fonte do slide em vez de cortar); logo e setas presentes conforme as regras acima.

Responder em uma linha: caminho do `arte.html` e número de slides.
