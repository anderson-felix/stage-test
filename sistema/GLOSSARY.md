# Stage Hub

Central web do marketing da Stage Consulting: junta o Claude, o TatuOS, o site, as redes sociais e as campanhas num lugar só.

## Sistema

**Hub**:
O app web deste repositório, onde o time de marketing opera.

**TatuOS**:
O sistema de marketing que roda dentro do Claude Code: memória, identidade, regras e skills. Vive no repositório `tatucotech/stage-mkt`.

**Workspace**:
A pasta do TatuOS que o hub lê e onde o Claude trabalha.
_Avoid_: repo de marketing, projeto

**Memória**:
Os arquivos de `contexto/` do workspace (negócio, voz, foco) que o Claude lê no início de cada conversa.

**Identidade**:
O guia visual da marca em `marca/` (`guia-visual.md` e a biblioteca `assets/`).

**Skill**:
Uma rotina empacotada que o Claude executa (ex.: `/carrossel`, `/abrir`).

**Usuário**:
Uma pessoa com login no hub (e-mail e senha). Papel **administrador** (também gerencia usuários) ou **membro** (usa todas as Abas). Todos trabalham no mesmo Workspace.
_Avoid_: conta, perfil

**Aba**:
Cada área de navegação do hub: Visão Geral, Site & LPs, Social, Estúdio (em breve), Tráfego & Leads, Claude Code.
_Avoid_: página, tela

**Estúdio**:
A Aba (em breve) que vai reunir a biblioteca de Posts criados, a edição de Artes, os Templates de post e a edição de vídeo.
_Avoid_: galeria, editor

**Cérebro da Stage**:
Como o TatuOS é apresentado fora do time técnico (liderança, clientes): a Memória, a Identidade e as Skills que a IA usa.

**Em breve**:
Selo de uma Aba ou recurso já planejado e visível no hub, mas ainda sem funcionar.

**Módulo**:
O conjunto de funcionalidades por trás de uma aba.

## Social

**Pauta**:
Um tema com ângulo definido, que dá origem a um ou mais Posts (um por canal).
_Avoid_: tema solto, ideia

**Post**:
Uma publicação planejada para um canal, com formato, roteiro, legenda, arte e data planejada.
_Avoid_: conteúdo, peça

**Canal**:
A rede onde o Post sai: Instagram ou LinkedIn.
_Avoid_: rede, plataforma

**Formato**:
O tipo de um Post. Instagram: carrossel, post único ou story. LinkedIn: carrossel (publicado como PDF) ou post único.

**Roteiro**:
O texto do Post slide a slide, com indicações visuais, escrito para o designer produzir a arte.
_Avoid_: briefing, copy

**Legenda**:
O texto que acompanha o Post na publicação.

**Arte**:
As imagens finais do Post. Tem uma origem: IA (gerada pela `/carrossel` e renderizada pelo hub) ou designer (enviada por upload).
_Avoid_: criativo, peça

**Editor de Arte**:
A tela do hub onde a Arte gerada pela IA é ajustada à mão (texto, posição, cores, imagens, slides) antes de re-renderizar.
_Avoid_: editor visual, Canva

**Lixeira**:
A pasta `marketing/social/_lixeira/` para onde vão Pautas e Posts excluídos no hub. Não aparece no Quadro e não vai para o git.

**Perfil do Canal**:
A cópia da página real da Stage em um Canal, lida pelo hub da página pública: o feed do Instagram (`/social/instagram`) e a página da empresa no LinkedIn (`/social/linkedin`). Guardada em `marketing/social/_perfis/<canal>/`.
_Avoid_: feed (é só a parte de posts do Perfil)

**Calendário editorial**:
A visão dos Posts pela data planejada de publicação.

**Status**:
A etapa em que o Post está: `rascunho` (Roteiro em ajuste), `aprovado` (Roteiro aprovado, ainda não foi ao designer), `em-design` (designer produzindo a Arte), `pronto` (Arte recebida, falta publicar), `publicado`.
_Avoid_: agendado (um Post `pronto` com data planejada já é um Post agendado)

**Quadro**:
A visão dos Posts em colunas por Status; tela principal da aba Social.
_Avoid_: kanban, board

**Layout**:
A composição sugerida para um slide do Roteiro: CAPA, SOLO, DUO, NÚMERO, CITAÇÃO ou CTA FINAL (mesmo vocabulário da skill `/carrossel`).

**Série**:
A família editorial e visual a que um Post pertence: Cultura em ação, Dado, Na mídia, Sócios, Evento ou Conteúdo. Cada Série tem seus Layouts e assets.
_Avoid_: categoria, linha, template

**Biblioteca de assets**:
Os elementos gráficos da marca exportados do Figma pelo designer (logo, setas, renders 3D, texturas, ilustrações, selos), que a IA encaixa na Arte.
_Avoid_: banco de imagens, kit

## Tráfego & Leads

**Campanha**:
Um plano de anúncios de pesquisa no Google Ads para um serviço da Stage: Grupos de anúncios, palavras-chave, Negativas e anúncios, exportados em CSV para o Google Ads Editor.
_Avoid_: anúncio (é uma peça dentro da Campanha), ads

**Termos sugeridos**:
A lista de termos que o Claude propõe para o usuário pesquisar no Planejador de palavras-chave, antes de existir Pesquisa.
_Avoid_: sementes (nome técnico do arquivo `sementes.md`)

**Pesquisa**:
O export do Planejador de palavras-chave do Google Ads (volume, concorrência e lance por termo), normalizado pelo hub.
_Avoid_: keyword research, levantamento

**Grupo de anúncios**:
Um tema de busca dentro da Campanha, com suas palavras-chave e seus anúncios.
_Avoid_: ad group, cluster

**Negativa**:
Termo que impede o anúncio de aparecer (ex.: "vaga", "curso"). Pode valer para a Campanha inteira ou para um Grupo.

**Landing Page (LP)**:
Uma página gerada pela IA como um HTML único, com formulário de interesse. Fica em Site & LPs; a publicação depende de quem mantém o site.

**Finalidade (da LP)**:
Para que a LP serve: **Campanha de Ads** (recebe o clique do anúncio, repete a promessa da Campanha, pode ficar atrelada a uma) ou **Página do site** (matéria ou conteúdo para o orgânico, indexável, nunca atrelada a Campanha).
_Avoid_: tipo de LP

**Lead**:
Pessoa que preencheu o formulário de uma LP. _(em definição: depende da decisão sobre CRM)_

## Desenvolvimento

**Diário**:
O registro de um dia de desenvolvimento do hub em `docs/diario/AAAA-MM-DD.md` (resumo, entregas, decisões, pendências, quadro de tarefas, vale divulgar). Escrito pela skill `/encerrar`.

**Sessão**:
Meio dia de trabalho. Unidade de peso dos itens do Escopo.

**Escopo**:
A lista de itens do hub com peso em Sessões, em `docs/PROGRESSO.md`. O Progresso é o peso concluído dividido pelo peso total.
_Avoid_: backlog
