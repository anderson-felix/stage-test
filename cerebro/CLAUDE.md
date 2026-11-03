# TatuOS

Este workspace roda o TatuOS. Antes de qualquer trabalho, o Claude conhece o negócio pelos
arquivos de `contexto/` e segue as regras abaixo.

## Este negócio

- **Negócio:** Stage Consulting, consultoria full service de transformação digital para empresas
  médias e grandes. Este workspace é da área de marketing.
- **Quem usa:** o time de marketing da Stage, pelo Stage Hub e pelo Claude Code
- **Foco do momento:** estruturar o marketing AI First: tráfego pago com LP, conteúdo e SEO
  (detalhe em `contexto/foco.md`)

## Stage Hub

O Stage Hub (app web) lê e grava neste workspace. Não mudar a estrutura destas pastas sem mudar o
hub junto:

- `marketing/social/`: Pautas e Posts (`pauta.md`, `post.md` com frontmatter, `legenda.md`,
  `arte/`). Valores aceitos em `marketing/social/README.md`.
- `marketing/ads/campanhas/` e `marketing/landing-pages/`.
- `contexto/negocio.md`, `contexto/voz.md`, `contexto/foco.md` e `marca/guia-visual.md` (o hub
  mostra se estão preenchidos), `marca/assets/` (logo e elementos das Artes).

O hub chama `/roteiro`, `/carrossel`, `/landing-page` e `/anuncio-google`. Quando o pedido cita
uma pasta de `marketing/`, a skill segue o modo do hub (no `/carrossel` e no `/anuncio-google`,
o arquivo `modo-hub.md` da pasta da skill).

## Antes de começar

1. Ler `contexto/negocio.md`, `contexto/voz.md` e `contexto/foco.md`. Não listar o que foi lido.
2. Para qualquer peça visual, ler também `marca/guia-visual.md` e `marca/canais.md`.
3. Quando aparecer um termo que não está claro, procurar em `contexto/glossario.md` antes de
   perguntar.

## Mapa das pastas

| Pasta | O que guarda |
|---|---|
| `contexto/` | Memória do negócio: `negocio.md`, `voz.md`, `foco.md`, `glossario.md`, `regras.md`, `campos-da-base.md` |
| `marca/` | `guia-visual.md` (cores, fontes, logo), `canais.md` (medidas e limites de cada canal), `assets/` (biblioteca das Artes) e `referencias/` |
| `marketing/` | Social, Ads e landing pages, lidos pelo Stage Hub |
| `entrada/` | Arquivos que o usuário solta para o Claude usar. Não vão para o GitHub |
| `entregas/` | Tudo o que o Claude produz. Uma subpasta por assunto, arquivo com data no nome |
| `projetos/` | Uma pasta por projeto, com `CLAUDE.md` próprio, briefing, andamento e entregas |
| `modelos/` | Perfis de negócio e exemplos de guia visual |
| `ferramentas/` | Scripts de apoio: gerar PNG e validar anúncios |
| `diario/` | `AAAA-MM-DD.md`, escrito pelo `/abrir` e pelo `/encerrar` |
| `decisoes/` | Uma decisão por arquivo, `AAAA-MM-DD-assunto.md` |
| `_privado/` | Planos não aprovados, pendências pessoais e `progresso.md`. Nunca vai para o GitHub |

## Como trabalhar

- **Uma pergunta por vez** quando faltar informação, com a resposta sugerida junto. Se der para
  descobrir lendo os arquivos, ler em vez de perguntar.
- **Escrever no tom de `contexto/voz.md`** tudo o que sai em nome do negócio.
- **Entregas em `entregas/`**, com nome que diga o que é e a data: `entregas/campanhas/2026-11-black-friday-email.md`.
- **Número em vez de adjetivo.** "Conversão de 9,7%", não "ótima conversão".
- **Não inventar dado.** Se o número não está nos arquivos, dizer que não está.

## Oficial × privado

- `contexto/`, `decisoes/`, `diario/` e `entregas/` só levam o que foi **definido ou aprovado**.
- Ideias, hipóteses, planos ainda não alinhados e assuntos pessoais vão para `_privado/`.
- Na dúvida, perguntar: "isso já é decisão ou ainda é ideia?"

## Aprender com as correções

Quando o usuário corrigir algo que vai se repetir (um termo, um tom, uma regra do negócio):

1. Propor numa linha onde guardar: `contexto/voz.md`, `contexto/glossario.md`,
   `contexto/negocio.md` ou uma decisão em `decisoes/`.
2. Guardar só depois do "sim".
3. Correção que vale só para aquela peça não é guardada.

## Decisões

Toda decisão que muda como o negócio opera (regra, critério, processo, preço, público) vira um
arquivo em `decisoes/` com: data, o que foi decidido, o motivo, quem decidiu e o que muda na
prática. Decisão nova que substitui uma antiga aponta para a antiga, que não é apagada.

## Git

- Salvar pelo `/salvar` ou no fim do dia pelo `/encerrar`.
- Conferir `git remote -v` antes de qualquer push.
- Nunca usar `--force`, nunca reescrever histórico, nunca commitar `_privado/` ou `entrada/`.

## Skills

| Skill | Para quê |
|---|---|
| `/abrir` | Começa o dia: hora de início, pendências, ritmo e prioridades |
| `/encerrar` | Fecha o dia: diário, progresso e salvar |
| `/salvar` | Salva o trabalho no GitHub |
| `/sabatina` | Entrevista um plano até não sobrar ponto em aberto, atualizando a documentação no caminho |
| `/roteiro` | Pauta vira Roteiro e Legenda de cada Post; também sugere Pautas |
| `/landing-page` | LP de serviço com formulário de interesse, ou página para o site |
| `/carrossel` | Carrossel ou post de imagem na identidade da marca, em PNG, com legenda |
| `/publicar-tema` | Um tema vira artigo do blog e as peças das redes que saem dele |
| `/aprovar-post` | Confere a peça antes de ir ao ar e publica direto no site, se ele estiver no GitHub |
| `/seo` | Diagnóstico e plano para aparecer na busca, no mapa e nas respostas de IA |
| `/anuncio-google` | Campanhas de pesquisa prontas para importar no Google Ads Editor |
| `/relatorio-ads` | Relatório de Google Ads e Meta Ads com comparação e próximas ações |
| `/copy-vendas` | Página de vendas, anúncio, mensagem de oferta, roteiro e títulos para testar |
| `/email-profissional` | E-mail de trabalho no tom certo para quem recebe |
| `/responder-avaliacoes` | Respostas para avaliações de clientes e o que elas dizem sobre o negócio |
| `/analisar-dados` | Responde uma pergunta de negócio a partir de uma planilha, conferindo os dados antes |
| `/mapear-rotinas` | Acha as tarefas repetitivas e transforma as melhores em skills novas |
| `/novo-projeto` | Abre um projeto com pasta, instruções próprias e acompanhamento |
| `/atualizar-contexto` | Revisa a memória do negócio contra o que aconteceu e propõe as atualizações |
| `/documentar-regra` | Transforma uma regra solta em regra escrita, com exemplo, exceções e dono |
| `/registrar-decisao` | Guarda a decisão com o porquê e as alternativas descartadas |
| `/escrever-spec` | Especifica uma funcionalidade ou processo antes de construir |
| `/quebrar-tarefas` | Divide a spec em tarefas do tamanho de uma sessão, na ordem certa |
| `/passagem` | Documento para outra pessoa (ou outra sessão) assumir o projeto |
| `/segmentar-base` | Quem recebe a campanha de CRM: filtros, exclusões, tamanho e controle |
| `protecao-git` | Conferências automáticas antes de qualquer comando Git que envia ou apaga |

## Ferramentas

- `ferramentas/renderizar.mjs`: transforma cada `<section class="tela">` de um HTML num PNG.
  Precisa do Node; na primeira vez, `npm install` e `npx playwright install chromium`.
- `ferramentas/validar-anuncios.mjs`: confere os limites de caracteres de um CSV de anúncios do
  Google Ads antes da importação.
