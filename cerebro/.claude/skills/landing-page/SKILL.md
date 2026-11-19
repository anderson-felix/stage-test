---
name: landing-page
description: >
  Cria a landing page de um serviço da Stage (HTML único, responsivo, com formulário de interesse
  e consentimento LGPD) e grava em marketing/landing-pages/. Também aplica ajustes pedidos.
  Use quando o usuário pedir "landing page", "LP", "página de campanha", "página de captação", ou /landing-page.
---

# /landing-page — LP de serviço com formulário

Uma LP por serviço ou oferta. Objetivo único: o visitante que veio do anúncio preenche o formulário de interesse.

O Stage Hub chama esta skill com a pasta da LP já criada (`marketing/landing-pages/<slug>/`, com `lp.md` e `logo.png`). Fora do hub, criar a pasta nesse mesmo padrão.

## Ler antes

1. `contexto/negocio.md`, `contexto/voz.md`, `contexto/foco.md`
2. `marca/guia-visual.md`
3. `<lp>/lp.md` — frontmatter (`servico`, `finalidade`, `campanha`) e briefing. Sem `finalidade`, tratar como `campanha`.
4. Se `campanha` estiver preenchido: `marketing/ads/campanhas/<campanha>/campanha.md` e `ads-editor/anuncios.csv` — a LP repete a promessa e os termos dos anúncios (mesma mensagem do clique à página)
5. Em **ajuste**: `<lp>/index.html` existente

## Gravar

Somente `<lp>/index.html`. Não editar `lp.md`.

**Ajuste:** quando o pedido trouxer "Ajuste pedido: …", editar o `index.html` existente aplicando só a mudança pedida.

## Finalidade

- **`campanha`** (padrão): LP de mídia paga. Segue a estrutura e as regras abaixo como estão.
- **`site`**: página ou matéria para o site, **sem Campanha** e sem promessa de anúncio. Mudanças em relação à LP de campanha:
  - Topo com logo e link "stage.consulting" (voltar ao site), além do botão "Fale com a Stage".
  - Hero com o título da matéria (pode passar de 10 palavras) e subtítulo; o formulário **não** fica no hero.
  - No lugar das seções 3 a 6: o conteúdo da matéria em 3 a 6 seções com subtítulos (`<h2>`), a partir do briefing, com tese, contexto e o que a empresa deve fazer. Fechar com um bloco "Como a Stage pode ajudar" ligando o tema ao serviço.
  - Perguntas frequentes opcionais; CTA final e formulário no fim da página (mesmo contrato abaixo).
  - `<meta name="robots" content="index, follow">` (é conteúdo para o orgânico), `<title>` e `<meta name="description">` pensados para busca.
  - O "Conferir" vale com essa estrutura no lugar das 9 seções.

## Estrutura da página (nesta ordem)

1. **Topo** — `logo.png` (caminho relativo, altura ~32px) e um botão âncora "Fale com a Stage" que leva ao formulário. Sem menu de navegação: a LP não tem saída.
2. **Hero** — headline (até 10 palavras, a tese do serviço, alinhada aos anúncios), subtítulo de 1–2 frases e o **formulário** ao lado (desktop) ou logo abaixo (celular).
3. **Problema** — 3 dores concretas do público (empresa média/grande), em frases curtas.
4. **Como a Stage faz** — 3 ou 4 etapas numeradas, do diagnóstico à entrega/adoção.
5. **O que você recebe** — 4 a 6 entregáveis concretos do serviço.
6. **Para quem** — setores atendidos (seguros, logística, energia, varejo, educação, tecnologia) e porte. **Não citar nomes de clientes** sem o usuário confirmar que podem aparecer.
7. **Perguntas frequentes** — 4 a 6, com `<details>`/`<summary>`.
8. **CTA final** — frase de fechamento + botão para o formulário.
9. **Rodapé** — "Stage Consulting · The new Stage of Consulting", link para stage.consulting e link "Política de privacidade" (`href="https://stage.consulting/politica-de-privacidade"` com `data-pendente="true"` até a URL real ser confirmada).

## Formulário (contrato com o hub)

```html
<form id="form-lead" data-endpoint="" novalidate> … </form>
```

- Campos, nesta ordem e com estes `name`: `nome` (obrigatório), `email` (obrigatório, tipo email, texto de ajuda "e-mail corporativo"), `empresa` (obrigatório), `cargo` (obrigatório), `telefone` (opcional), `servico` (select com os serviços da Stage, já selecionado no serviço da LP), `mensagem` (opcional, textarea).
- `consentimento` (checkbox obrigatório): "Concordo em receber contato da Stage sobre este assunto, conforme a Política de privacidade."
- Campos ocultos preenchidos por script a partir da URL: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`, e `pagina` (= `location.pathname`).
- Script inline no fim do `<body>`: valida os obrigatórios e mostra o erro abaixo do campo; se `data-endpoint` estiver vazio, **não envia** e mostra "Formulário em modo de visualização: o envio será ativado na publicação."; se tiver endpoint, faz `fetch(endpoint, { method: "POST", body: JSON })` e troca o formulário por uma mensagem de obrigado. Em sucesso, dispara `window.dataLayer?.push({ event: "lead_enviado", servico })` (conversão no GTM).

## Visual

- Identidade de `marca/guia-visual.md`: Open Sans (Google Fonts) 400/600/700/800, roxo `#4C0DFF` no CTA, títulos `#21005E`/`#6D23F9` no claro, fundo branco com seções alternando `#F6F3FF`; hero em gradiente escuro `#21005E` → `#0B0420` com forma fluida roxa desfocada e texto branco (aí o logo recebe `filter: brightness(0) invert(1)`).
- Responsivo de verdade: uma coluna abaixo de 900px, fontes fluidas com `clamp()`, alvos de toque ≥ 44px, sem rolagem horizontal.
- CSS todo num `<style>`; única dependência externa: Google Fonts. Nenhuma imagem da internet; formas em CSS/SVG inline.
- Acessível: `lang="pt-BR"`, `<label>` em todo campo, contraste AA, foco visível.
- `<title>` e `<meta name="description">` com o serviço; `<meta name="robots" content="noindex">` (LP de mídia paga não deve competir com o site no orgânico).

## Texto

- Tom de `contexto/voz.md`: tese + contraste + fechamento em resultado. Corpo em português.
- Nada de números, cases ou depoimentos inventados.

## Conferir (done)

Done quando: as 9 seções existem na ordem; o formulário tem todos os `name` acima, `id="form-lead"` e `data-endpoint=""`; o script não envia sem endpoint; não há link externo além de stage.consulting e Google Fonts; a página funciona em 390px de largura.

Responder em uma linha: caminho do `index.html` e a headline escolhida.
