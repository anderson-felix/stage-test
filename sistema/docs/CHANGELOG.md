# Changelog

Mudanças relevantes do Stage Hub, da mais recente para a mais antiga.

## 2026-10-26

- **Workspace novo:** `tatucotech/stage-mkt` substitui `tatucotech/Tatu-OS---Stage-MKT`
  (arquivado), já na estrutura do TatuOS. O hub passa a ler `contexto/` (negocio, voz, foco) no
  lugar de `_memoria/`, e `marca/` (`guia-visual.md`, `assets/`) no lugar de `identidade/`.
  `marketing/` não mudou. As Artes antigas tiveram o caminho do logo atualizado. Para quem roda
  local: clonar o repositório novo e apontar `WORKSPACE_DIR` para ele.

## 2026-10-14

- **Finalidade da LP:** ao criar uma LP, a pessoa escolhe se ela vai para uma **Campanha de Ads** ou se é uma **Página do site** (matéria/conteúdo, sem Campanha). A tela da LP ganhou o quadro Finalidade para trocar e atrelar/desatrelar a Campanha depois. Campo `finalidade` no `lp.md` (sem o campo = `campanha`); página do site nunca fica com Campanha. A skill `/landing-page` ganhou o modo `site` (matéria indexável, formulário no fim). Rotas `POST /api/lp` e `PATCH /api/lp/[slug]` aceitam `finalidade` e `campanha`.
- **Landing Pages passaram para Site & LPs** (`/site/lp/<slug>`); Tráfego & Leads aponta para lá.
- **Social → LinkedIn** (`/social/linkedin`, [ADR 0011](adr/0011-linkedin-pela-pagina-publica.md)): página real da Stage (`br.linkedin.com/company/stageconsulting`) lida do JSON-LD público com `fetch` simples: logo, slogan, local, seguidores, funcionários, descrição e os 10 posts recentes (tipo, data, curtidas, link). Cópia em `marketing/social/_perfis/linkedin/`, botão "Atualizar do LinkedIn" e atualização diária; Posts de LinkedIn planejados ao lado. Rota `GET|POST /api/social/linkedin`.
- **Estúdio** no menu principal (entre Social e Tráfego & Leads) com selo "em breve"; `/estudio` descreve biblioteca de Posts, edição de Artes, Templates e edição de vídeo.
- Social: aba Analytics marcada como "em breve" (métricas via APIs oficiais do Instagram e do LinkedIn).
- `/roteiro` grava `titulo` e `angulo` entre aspas: um ângulo com `:` quebrava o YAML e o Quadro mostrava "Post fora do padrão".
- **Diário de desenvolvimento:** `docs/PROGRESSO.md` (escopo com peso em sessões, barra, ritmo, histórico por dia), `docs/diario/` (um arquivo por dia + `_modelo.md`) e skills `/abrir` e `/encerrar`.
- Documentação: PRD com o roadmap aprovado pelo dono da Stage em 2026-10-14; ADRs 0011 (LinkedIn) e 0012 (Finalidade da LP); glossário, App Flow, Backend, TRD, Design System e Plano atualizados.
- Render e Instagram: Chromium compartilhado sem GPU, reaberto se travar (`novaPagina`), e `PLAYWRIGHT_CHANNEL=msedge` para máquinas com Smart App Control.

## 2026-10-08

- **Editor de Arte** ([ADR 0008](adr/0008-editor-de-arte-sobre-o-html.md)): a Arte gerada pela IA ficou editável no hub, em `/social/<pauta>/<post>/editor` (botão "Editar Arte" no painel da Arte). Edita o próprio `arte.html` num iframe sem scripts: texto com duplo clique, arrastar para mover, alça para redimensionar, fonte (tamanho, peso, itálico, alinhamento), cores da paleta da marca, opacidade, camada, fundo do slide, inserir texto, inserir/trocar imagem da Biblioteca de assets ou enviada do computador, duplicar/mover/apagar slides, desfazer/refazer e atalhos de teclado. "Salvar e renderizar" grava o HTML (limpo de scripts e marcas do editor), guarda o anterior em `arte/historico/` e gera PNGs/PDF de novo. Rotas novas: `GET /api/ws/[...path]`, `PUT .../arte/html`, `GET|POST .../arte/imagens`.
- "Gerar do zero" pede confirmação e agora também guarda o `arte.html` anterior no histórico (antes só PNG/PDF).
- **Social → Instagram** (`/social/instagram`, [ADR 0010](adr/0010-feed-instagram-pelo-perfil-publico.md)): mostra o feed **real** de @stage.consulting: avatar, posts/seguidores/seguindo, bio e os 12 posts mais recentes (carrossel, vídeo, fixado), lidos do perfil público pelo Chromium do servidor e guardados em `marketing/social/_perfis/instagram/` (miniaturas + `feed.json`). Botão "Atualizar do Instagram" e atualização automática quando a cópia passa de um dia; se o Instagram bloquear, fica a última cópia com aviso. Clicar num post abre o post incorporado pelo próprio Instagram. Opção de pré-visualizar por cima os Posts planejados no hub. Campo **Link do post** no Post publicado (`link_publicado`). Navegação Quadro · Calendário · Instagram (`SocialAbas`). Rota `GET|POST /api/social/instagram`.
- **Logins por pessoa** ([ADR 0009](adr/0009-usuarios-em-arquivo-no-hub.md)): e-mail e senha, papéis administrador e membro. Primeiro acesso cria o administrador com a chave de instalação (`HUB_PASSWORD`). Tela **Usuários** (só admin): criar com senha provisória, redefinir senha, mudar papel, desativar/reativar. Tela **Minha conta**: trocar a senha (obrigatório com senha provisória; derruba as outras sessões). Menu da pessoa no topo. Usuários em `DATA_DIR/usuarios.json` (scrypt), sessão JWT com o id e conferida pelo proxy a cada requisição. Rotas `/api/login` (GET/POST/DELETE), `/api/login/setup`, `/api/conta`, `/api/usuarios`, `/api/usuarios/[id]`.
- **Pacote de deploy** ([docs/DEPLOY.md](DEPLOY.md)): `Dockerfile` (imagem do Playwright + Claude Code), `docker-compose.yml` com Caddy (HTTPS automático, endereço provisório via sslip.io), volumes de dados, sessões e workspace, e guia passo a passo da VPS. Aguarda a chave de API da Anthropic.
- Corrigido o aviso do Next 16 em todas as páginas (`usePathname` do `TopNav` fora de `<Suspense>`).
- **Progresso das gerações da IA** (`src/components/ProgressoIA.tsx`): Nova Pauta, Arte (gerar/ajustar), LP (gerar/ajustar) e Campanha (termos/montar) mostram barra de progresso, etapas com check, status atual numa linha e tempo decorrido vs. estimado, no lugar da lista crua de passos. As etapas avançam pelos eventos do stream do Claude (leitura, redação, gravação, render); entre eventos, a barra anda pelo tempo estimado (até 95%).
- **Excluir Pauta ou Post:** seção Excluir na tela do Post (só este Post, ou a Pauta inteira; excluir o último Post leva a Pauta junto). Nada é apagado: a pasta vai para `marketing/social/_lixeira/<data-hora>_<pauta>[_<post>]/`, que o Quadro ignora e o TatuOS não versiona. Rota `DELETE /api/social/posts/[pauta]/[post][?pauta=1]`.
- Skill `/carrossel` (Modo Hub) preserva as edições manuais do editor nos ajustes pedidos à IA.

## 2026-10-07

- **Tráfego & Leads T2 (Landing Pages):** skill `/landing-page` no TatuOS (9 seções, formulário com LGPD e captura de UTM/gclid em modo de visualização até existir destino para os leads, `noindex`, mesma mensagem da Campanha). No hub: seção Landing Pages em Tráfego & Leads, modal Nova LP (também pelo botão de Site & LPs), tela da LP com preview desktop/celular em iframe isolado (sandbox + CSP), ajustes por texto, Status e download do HTML com o logo embutido (`src/lib/lp.ts`, rotas `/api/lp*` e `/api/lp-preview`).
- **Tráfego & Leads T1 (Campanhas):** aba Tráfego & Leads com lista de Campanhas e Nova Campanha. A skill `/anuncio-google` ganhou o Modo Hub (B2B nacional; Termos sugeridos e montagem a partir da Pesquisa, com cabeçalhos fixos de CSV do Google Ads Editor). O hub lê o export do Planejador de palavras-chave (UTF-16/TSV, PT/EN, faixas de volume) em `src/lib/ads.ts`/`csv.ts`, mostra Grupos, palavras, Negativas e o anúncio como aparece no Google, com contagem de caracteres, e baixa os CSVs. Primeira Campanha: "Consultoria de IA para empresas" (montada a partir dos Termos sugeridos, sem volume; refazer com a Pesquisa real). LP, Leads e Relatórios aguardam o levantamento com o time.
- `src/lib/frontmatter.ts` concentra leitura/gravação de frontmatter e `slugify`; `src/lib/stream-client.ts` lê o stream do Claude no navegador.
- **Social S6:** Calendário editorial mensal (`/social/calendario`) com navegação entre meses e lista de Posts sem data; botão "Marcar como publicado" no Post `pronto` (grava `publicado_em`). Upload da Arte do designer entrou junto com a S4.
- **Social S4 + S5:** Arte gerada pela IA. A skill `/carrossel` ganhou o Modo Hub (lê o Roteiro do Post, escreve só `arte/arte.html` no padrão visual da Stage) e o servidor do hub renderiza com Playwright (`src/lib/render.ts`): PNG por slide e PDF no carrossel do LinkedIn. Painel da Arte no Post com preview no estilo do feed, "Pedir ajuste à IA", gerar do zero, baixar PNGs/PDF e upload da Arte do designer. Arte anterior vai para `arte/historico/`. Capa do Post aparece no card do Quadro.
- **Social S3:** tela do Post (`/social/<pauta>/<post>`) com Roteiro em slides (editável), Legenda editável, Status, data planejada, navegação entre Canais da Pauta e exportação (copiar / baixar .md). Cards do Quadro clicáveis e arrastáveis entre colunas. Rotas `GET`/`PATCH /api/social/posts/[pauta]/[post]`.
- **Site & LPs:** preview ao vivo do stage.consulting (desktop/celular, recarregar, abrir em nova aba) e botão Nova LP inativo.
- **Logo oficial** da Stage no topo e no login, no lugar do ícone provisório.
- Explicação do campo Ângulo no modal Nova Pauta.
- **Social S2:** botão Nova Pauta (tema, ângulo, Canais/Formatos, data) chama a skill `/roteiro` do TatuOS e mostra o progresso; botão Sugerir Pautas traz 5 ideias a partir da estratégia. Rotas `POST /api/social/pautas` e `/api/social/pautas/sugestoes`; `collectClaude()` em `lib/claude.ts`.
- **Social S1:** aba Social com Quadro por Status (`src/lib/social.ts`, `GET /api/social/posts`). Posts com frontmatter fora do padrão aparecem como aviso. Pautas de exemplo no workspace (`exemplo: true`).
- Repositórios privados no GitHub: `tatucotech/stage-hub` (hub) e `tatucotech/Tatu-OS---Stage-MKT` (TatuOS, histórico reiniciado).
- Documentação do sistema: `GLOSSARY.md`, ADRs em `docs/adr/`, este changelog.
- Skills de engenharia instaladas em `.claude/skills/` (seleção de mattpocock/skills, MIT): grill-with-docs, grilling, domain-modeling, to-spec, handoff, writing-for-agents, diagnosing-bugs, setup-matt-pocock-skills.
- Workspace de marketing renomeado para TatuOS.
- Módulo Social especificado com /grill-with-docs: Pauta, Post, Série, Roteiro, Arte gerada pela IA (ADRs 0005–0007).
- Documentação completa em `docs/`: PRD, TRD, APP-FLOW, DESIGN-SYSTEM, BACKEND, PLANO.

## 2026-10-06

- MVP: login, Visão Geral, chat com o Claude (Claude Code headless) e explorador de arquivos do workspace. Abas Site & LPs, Social e Tráfego & Leads como placeholders.
