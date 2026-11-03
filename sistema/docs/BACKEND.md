# Backend — Stage Hub

Rotas da API e o esquema de dados. Não há banco: os dados são arquivos no workspace TatuOS ([ADR 0005](adr/0005-posts-como-arquivos-no-workspace.md)).

## Rotas existentes

Todas exigem sessão, exceto `/api/login` e `/api/login/setup`. As de `/api/usuarios` exigem administrador.

| Método | Rota | Entrada | Saída |
|---|---|---|---|
| GET | `/api/login` | — | `{ precisaSetup }`: o hub ainda não tem usuários |
| POST | `/api/login` | `{ email, senha }` | Cookie `hub_session` + `{ trocarSenha }` |
| DELETE | `/api/login` | — | Remove o cookie |
| POST | `/api/login/setup` | `{ chave, nome, email, senha }` | Cria o primeiro administrador (só sem usuários; `chave` = `HUB_PASSWORD`) |
| GET | `/api/conta` | — | Usuário logado |
| PATCH | `/api/conta` | `{ senhaAtual, novaSenha }` | Troca a própria senha; novo cookie |
| GET | `/api/usuarios` | — | Lista (admin) |
| POST | `/api/usuarios` | `{ nome, email, papel }` | Cria com senha provisória, devolvida uma vez (admin) |
| PATCH | `/api/usuarios/[id]` | `{ nome?, papel?, ativo?, redefinirSenha? }` | Altera; `redefinirSenha` devolve nova provisória (admin) |
| POST | `/api/chat` | `{ message, sessionId? }` | Stream NDJSON de `ChatEvent` (`session`, `text_start`, `text`, `tool`, `done`) |
| GET | `/api/files` | `?path=` | Lista do diretório ou conteúdo do arquivo |
| PUT | `/api/files` | `{ path, content }` | Grava arquivo de texto |
| GET | `/api/status` | — | Status da Visão Geral (site, workspace, Claude) |

## Rotas previstas (Social)

| Método | Rota | Função |
|---|---|---|
| GET | `/api/social/posts` | ✅ Índice de Pautas e Posts (frontmatter) + `invalidos`, para Quadro e Calendário |
| POST | `/api/social/pautas` | ✅ Cria Pauta e chama `/roteiro` (stream NDJSON de ChatEvent; pasta no header `X-Pauta-Path`) |
| POST | `/api/social/pautas/sugestoes` | ✅ 5 sugestões de Pauta da `/roteiro` (modo Sugerir), em JSON |
| GET | `/api/social/posts/[pauta]/[post]` | ✅ Post completo: frontmatter, Roteiro, Legenda e Posts irmãos da Pauta |
| PATCH | `/api/social/posts/[pauta]/[post]` | ✅ Atualiza Status, data planejada, Roteiro ou Legenda (`publicado` grava `publicado_em`) |
| DELETE | `/api/social/posts/[pauta]/[post]` | ✅ `[?pauta=1]` move o Post (ou a Pauta inteira) para `marketing/social/_lixeira/`; o último Post leva a Pauta junto |
| POST | `/api/social/posts/[pauta]/[post]/arte` | ✅ `{ ajuste? }` gera ou ajusta a Arte (`/carrossel` Modo Hub) e renderiza; stream NDJSON com evento `Render` |
| POST | `/api/social/posts/[pauta]/[post]/render` | (não implementado: o render roda dentro de `POST .../arte`) |
| PUT | `/api/social/posts/[pauta]/[post]/arte` | ✅ Upload da Arte do designer (multipart `arquivos`: PNG/JPG viram slide-NN, PDF vira arte.pdf) |
| PUT | `/api/social/posts/[pauta]/[post]/arte/html` | ✅ `{ html }` do Editor de Arte: limpa scripts/handlers/marcas do editor, guarda o HTML anterior no histórico, grava e re-renderiza; devolve o Post |
| GET | `/api/social/posts/[pauta]/[post]/arte/imagens` | ✅ Imagens para o editor: `{ biblioteca, post }` (`identidade/assets/**` e `<post>/arte/imagens/`) |
| POST | `/api/social/posts/[pauta]/[post]/arte/imagens` | ✅ Upload de foto do editor (multipart `arquivo`, PNG/JPG/WEBP/GIF/SVG, 10 MB) → `{ path }` |
| GET | `/api/ws/[...path]` | ✅ Serve o `arte.html` e imagens/fontes de `identidade/` e `marketing/social/` com caminhos espelhando o workspace (iframe do editor); CSP `script-src 'none'` |
| GET | `/api/social/instagram` | ✅ Última cópia do feed real (`feed.json`) ou `null` |
| POST | `/api/social/instagram` | ✅ Lê o perfil público agora (10–30 s) e atualiza a cópia; se falhar, mantém a anterior com `erro` |
| GET | `/api/social/linkedin` | ✅ Última cópia da página do LinkedIn (`feed.json`) ou `null` |
| POST | `/api/social/linkedin` | ✅ Lê a página pública agora (`fetch` simples, JSON-LD, poucos segundos) e atualiza a cópia; se falhar, mantém a anterior com `erro` |
| GET | `/api/social/arquivo` | ✅ `?path=[&download=1]` serve PNG/JPG/PDF de `marketing/social/**/arte/` |
| GET | `/api/social/posts/[pauta]/[post]/export` | `?formato=md\|pdf` — Roteiro para o designer |

## Esquema de dados (arquivos)

```
marketing/social/
  _lixeira/<data-hora>_<pauta>[_<post>]/   ← Pautas e Posts excluídos pelo hub (fora do git)
  _perfis/instagram/                      ← feed real do Instagram: feed.json, avatar.jpg e <codigo>.jpg (miniaturas)
  _perfis/linkedin/                       ← página real do LinkedIn: feed.json, logo.jpg e <id>.jpg (posts de imagem)
  <AAAA-MM-DD>-<slug-da-pauta>/
    pauta.md
    <canal>-<formato>/            ex.: instagram-carrossel, linkedin-post-unico
      post.md
      legenda.md
      arte/
        arte.html                 ← gerado pela /carrossel (origem IA)
        slide-01.png … slide-NN.png
        arte.pdf                  ← carrossel do LinkedIn
        imagens/                  ← fotos enviadas pelo Editor de Arte
        historico/<data-hora>/    ← Arte anterior (PNG/PDF e arte.html), guardada a cada render, edição ou upload
```

### `pauta.md`

```yaml
---
titulo: Adoção de IA não é projeto de TI
angulo: O gargalo é adoção, não tecnologia
objetivo: autoridade        # autoridade | cultura | recrutamento | evento | institucional
criada_em: 2026-10-07
---
Contexto livre da Pauta.
```

### `post.md`

```yaml
---
canal: instagram            # instagram | linkedin
formato: carrossel          # carrossel | post-unico | story
serie: conteudo             # cultura-em-acao | dado | na-midia | socios | evento | conteudo
status: rascunho            # rascunho | aprovado | em-design | pronto | publicado
data_planejada: 2026-10-14  # opcional
link_publicado:             # link do post no Canal depois de publicado (opcional)
origem_arte: ia             # ia | designer (vazio até existir Arte)
publicado_em:               # preenchido ao marcar publicado
---
### Slide 1 — CAPA
Texto: "..."
Visual: ...
```

### `legenda.md`

Texto da Legenda pronto para colar, com hashtags no fim.

## Workspace: Séries e Biblioteca de assets

```
identidade/
  design-guide.md
  series.md                 ← regras de cada Série (Layouts, fundos, assets)
  assets/
    logo/  setas/  formas/  renders/  texturas/  ilustracoes/  selos/
  referencias/              ← prints e peças de referência
```

## Tráfego & Leads — rotas

| Método | Rota | Função |
|---|---|---|
| GET | `/api/ads/campanhas` | ✅ Lista as Campanhas |
| POST | `/api/ads/campanhas` | ✅ `{ titulo, servico, orcamentoDiario?, regiao?, briefing? }` cria pasta e `campanha.md` |
| GET | `/api/ads/campanhas/[slug]` | ✅ Campanha completa: briefing/estratégia, Pesquisa, Termos sugeridos, Grupos, anúncios, Negativas, arquivos |
| PATCH | `/api/ads/campanhas/[slug]` | ✅ `{ status?, lpUrl?, orcamentoDiario? }` |
| PUT | `/api/ads/campanhas/[slug]/pesquisa` | ✅ Upload do export do Planejador (multipart `arquivo`; CSV/TSV, UTF-8 ou UTF-16, PT ou EN, ou lista simples) |
| POST | `/api/ads/campanhas/[slug]/montar` | ✅ `{ tarefa: "sementes" \| "montar" }` chama `/anuncio-google` (Modo Hub); stream NDJSON |
| GET | `/api/ads/arquivo` | ✅ `?path=` baixa CSV/MD de `marketing/ads/campanhas/**/(ads-editor\|pesquisa)/` |

## Tráfego & Leads — esquema de arquivos

```
marketing/ads/campanhas/
  <AAAA-MM-DD>-<slug>/
    campanha.md                ← frontmatter + Briefing, Estratégia, Antes de ativar, Como importar
    pesquisa/
      sementes.md              ← Termos sugeridos para o Planejador
      original.<ext>           ← arquivo enviado, como veio
      palavras-chave.csv       ← palavra,volume,volume_min,volume_max,concorrencia,lance_min,lance_max
    ads-editor/                ← formato de importação do Google Ads Editor (tudo Paused)
      campanhas.csv  grupos.csv  keywords.csv  keywords-negativas.csv  anuncios.csv  extensoes-sitelinks.csv
```

### `campanha.md`

```yaml
---
titulo: Consultoria de IA para empresas
servico: technology        # technology | strategy-business | experience-design | people-development | institucional
objetivo: formulario
orcamento_diario:          # R$/dia, opcional
regiao: Brazil
lp_url:                    # https://... quando a LP existir
status: rascunho           # rascunho | pronta | ativa | encerrada
criada_em: 2026-10-07
---
```

O cabeçalho exato de cada CSV de `ads-editor/` está na skill `/anuncio-google` (Modo Hub); o hub lê esses arquivos pelo cabeçalho.

## Landing Pages — rotas

| Método | Rota | Função |
|---|---|---|
| GET | `/api/lp` | ✅ Lista as LPs |
| POST | `/api/lp` | ✅ `{ titulo, servico, finalidade?, campanha?, briefing? }` cria a pasta (`lp.md` + cópia do logo); `finalidade` padrão `campanha`; com `site`, `campanha` é ignorada |
| GET / PATCH | `/api/lp/[slug]` | ✅ LP; `PATCH { status?, urlPublicada?, finalidade?, campanha? }` (`campanha: null` desatrela; atrelar uma Campanha faz a LP virar `campanha`) |
| POST | `/api/lp/[slug]/gerar` | ✅ `{ ajuste? }` chama `/landing-page`; stream NDJSON |
| GET | `/api/lp/[slug]/download` | ✅ `index.html` com o logo embutido (data URI), pronto para publicar |
| GET | `/api/lp-preview/[slug]` | ✅ Mesmo HTML para o iframe do hub, com `Content-Security-Policy: sandbox allow-scripts allow-forms; connect-src 'none'; form-action 'none'` |

## Landing Pages — esquema de arquivos

```
marketing/landing-pages/
  <slug>/                  ← sem data: o slug vira o caminho público (/consultoria-de-ia-para-empresas)
    lp.md                  ← frontmatter + Briefing
    logo.png               ← cópia de identidade/assets/logo/
    index.html             ← gerado pela /landing-page
```

```yaml
---
titulo: Consultoria de IA para empresas
servico: technology
finalidade: campanha      # campanha (LP de Ads, padrão quando ausente) | site (página/matéria, indexável, sem Campanha)
campanha: 2026-10-07-consultoria-de-ia-para-empresas   # opcional, só em finalidade campanha: a LP repete a mensagem dos anúncios
status: rascunho          # rascunho | aprovada | publicada
url_publicada:
criada_em: 2026-10-07
---
```

**Contrato do formulário** (definido na skill `/landing-page`): `<form id="form-lead" data-endpoint="">` com `nome`, `email`, `empresa`, `cargo`, `telefone`, `servico`, `mensagem`, `consentimento` e ocultos `utm_*`, `gclid`, `pagina`. Sem `data-endpoint` o formulário não envia; com endpoint (T4), faz POST JSON e dispara `dataLayer.push({ event: "lead_enviado" })` para a conversão no GTM.
