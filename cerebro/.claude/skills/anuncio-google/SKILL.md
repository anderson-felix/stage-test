---
name: anuncio-google
description: >
  Monta campanhas de pesquisa do Google Ads prontas para importar no Google Ads Editor: estrutura
  por tema, palavras-chave, negativas, anúncios responsivos dentro dos limites de caracteres e o
  orçamento. Use quando o usuário disser "anúncio no Google", "Google Ads", "campanha de pesquisa",
  "links patrocinados", "/anuncio-google".
---

# /anuncio-google

Anúncio de pesquisa aparece para quem já está procurando. O trabalho é escolher bem as buscas,
falar exatamente daquilo no anúncio e levar para a página certa.

> **Stage Hub:** se o pedido cita uma pasta de `marketing/ads/campanhas/`, seguir só o
> `modo-hub.md` desta pasta.

## 1. Briefing

Ler `contexto/negocio.md`, `contexto/voz.md`, `contexto/foco.md` e, se existir, o último
diagnóstico em `entregas/seo/` (as palavras de "comprar agora" saem de lá).

Confirmar o que faltar, uma pergunta por vez:
- **O que anunciar** (serviços ou produtos) e **o que conta como resultado**: ligação, formulário,
  WhatsApp, compra, agendamento.
- **Onde:** cidades ou raio em volta do endereço.
- **Quanto:** orçamento por mês. Dividir por 30,4 para o orçamento diário.
- **Para onde leva:** a página de cada serviço. Página genérica derruba o resultado; se não
  existir página do serviço, avisar antes de seguir.

## 2. Estrutura

- **Uma campanha** por objetivo ou região com orçamento próprio. Começar com poucas: orçamento
  dividido demais não aprende.
- **Um grupo de anúncios** por tema de busca (ex.: "check-up", "exame de sangue"), com 5 a 20
  palavras-chave bem parecidas entre si.
- **Correspondência:** frase e exata para começar. Ampla só com acompanhamento de conversão
  funcionando.
- **Negativas desde o primeiro dia:** emprego, vaga, curso, grátis, como fazer em casa, nomes de
  concorrentes (se o usuário não quiser disputar), e o que o negócio não vende.

Mostrar a estrutura numa tabela (campanha → grupos → exemplos de palavras) e esperar o "ok".

## 3. Anúncios

Um anúncio responsivo por grupo:
- **10 a 15 títulos de até 30 caracteres.** Pelo menos 3 com o nome do serviço, 2 com a cidade, 2
  com diferencial concreto (prazo, preço, nota), 2 com chamada para ação.
- **4 descrições de até 90 caracteres.** Uma com o benefício, uma com prova (número, tempo de
  mercado, avaliações), uma com a oferta, uma com a chamada.
- **Caminhos** (Path 1 e 2) de até 15 caracteres, com o serviço.
- No tom de `contexto/voz.md`. Sem promessa que o negócio não cumpre e sem número sem fonte.
- Atenção às regras do setor: saúde, finanças e jurídico têm restrições de anúncio; avisar quando
  o texto se aproximar delas.

## 4. Arquivos para importar

Salvar em `entregas/anuncios/AAAA-MM-DD-nome/`:

**`palavras-chave.csv`**
```
Campaign,Ad Group,Keyword,Criterion Type,Max CPC,Final URL
```
`Criterion Type`: `Phrase` ou `Exact`.

**`negativas.csv`**
```
Campaign,Ad Group,Keyword,Criterion Type
```
Negativa da campanha inteira: `Ad Group` vazio e `Criterion Type` = `Campaign Negative Phrase`.

**`anuncios.csv`**
```
Campaign,Ad Group,Headline 1,…,Headline 15,Description 1,…,Description 4,Path 1,Path 2,Final URL
```

**`campanhas.csv`**
```
Campaign,Campaign Type,Budget,Bid Strategy Type,Networks,Locations
```
Rede: só Pesquisa (desmarcar a Rede de Display). Lance: maximizar cliques no começo; trocar para
maximizar conversões quando houver ao menos 30 conversões por mês.

Antes de entregar:
```
node ferramentas/validar-anuncios.mjs entregas/anuncios/<pasta>/anuncios.csv
```
Corrigir até sair `OK`.

## 5. Como subir

Explicar em `entregas/anuncios/<pasta>/como-importar.md`:
1. Google Ads Editor → baixar a conta.
2. Conta → Importar → do arquivo, um CSV por vez, nesta ordem: campanhas, palavras-chave,
   negativas, anúncios. Conferir o mapeamento das colunas na tela de importação.
3. Revisar as mudanças propostas, publicar **com as campanhas pausadas**, conferir no painel e só
   então ativar.
4. Conferir que a conversão está sendo medida antes de ativar.

## Resposta

```
Campanha pronta · N campanhas · N grupos · N palavras · N anúncios (validados)
Orçamento: R$ X/dia · Região: …
Pasta: entregas/anuncios/<pasta>/
Antes de ativar: conferir a medição de conversão
```
