# PRD — Stage Hub

Documento de requisitos do produto. Termos em **negrito** seguem o [GLOSSARY.md](../GLOSSARY.md); decisões técnicas ficam no [TRD](TRD.md) e nas [ADRs](adr/).

## Visão

A área de marketing da Stage Consulting é nova e nasce **AI First**. O Stage Hub junta num lugar só o Claude (com a memória, a identidade e as skills do **TatuOS**), o site, as redes sociais e as campanhas, para que um time pequeno opere como um time grande.

## Usuários

| Quem | Hoje | Futuro |
|---|---|---|
| Responsável pelo marketing (Fernando) | Único usuário do hub | Administrador |
| Time de marketing (~10 pessoas) | Usa o TatuOS direto no Claude Code | Usuários do hub (fase multiusuário) |
| Designer | Recebe Roteiros e entrega Arte fora do hub | Acesso ao hub para Posts em `em-design` |

## Módulos

| Aba | Módulo | Estado |
|---|---|---|
| Visão Geral | Cards de status + chat com o Claude | Entregue (MVP); números de Social e Tráfego quando as contas forem integradas |
| Site & LPs | Landing Pages (Campanha de Ads ou Página do site) e site ao vivo | LPs e preview entregues; publicação direta, editor de página e SEO previstos |
| Social | Pautas, Posts, Roteiro, Arte da IA, Editor de Arte, Quadro, Calendário, Instagram e LinkedIn reais | Entregue (2026-10-07 a 2026-10-14); Analytics em breve |
| Estúdio | Biblioteca de Posts, edição de Artes, Templates, edição de vídeo | **Em breve** (Aba visível desde 2026-10-14) |
| Tráfego & Leads | Campanhas Google Ads, leads e funil, relatórios | **Em andamento** (Campanhas entregues) |
| Claude Code | Explorador de arquivos do workspace + chat | Entregue (MVP); envio de arquivos e histórico de conversas previstos |

**Aprovação:** o projeto foi apresentado ao dono da Stage e aprovado em 2026-10-14, com o roadmap da seção abaixo. O andamento fica em [PROGRESSO.md](PROGRESSO.md).

## Roadmap aprovado (2026-10-14)

- **Hub para o time:** deploy na VPS com a chave de API da Anthropic.
- **Site & LPs:** publicar páginas e LPs aprovadas direto no servidor de hospedagem do site; editor de página (ajustes sem pedir à IA, sem custo de tokens); painel de SEO.
- **Social:** APIs oficiais do Instagram e do LinkedIn (agendar, publicar e métricas na aba Analytics e na Visão Geral).
- **Estúdio:** biblioteca de Posts com edição de Artes, Templates de post e edição de vídeo (Reels, Stories).
- **Tráfego & Leads:** Leads e funil ligados ao Monday; relatório semanal de Ads.
- **Claude Code:** enviar arquivos pela tela e histórico de conversas.

---

## Módulo Social

### Problema

Criar Posts para Instagram e LinkedIn hoje depende de escrever um Roteiro à mão e esperar o designer produzir a Arte. A estratégia aponta o Roteiro como a rotina que mais pesa, e a produção de Arte é o gargalo para publicar com frequência.

### Solução

O usuário cria uma **Pauta**; o Claude escreve o **Roteiro** e a **Legenda** de cada **Post**; ao aprovar o Roteiro, a IA gera a **Arte** no estilo da **Série** do Post e o hub renderiza os arquivos prontos para publicar. Ajustes são pedidos pelo chat ou feitos à mão no Editor de Arte. O designer continua disponível para peças especiais.

### Histórias de usuário

**Pautas**
1. Como responsável pelo marketing, quero criar uma Pauta com tema e ângulo, para que o Claude produza os Posts a partir dela.
2. Como responsável, quero pedir ao Claude sugestões de Pauta com base na estratégia, para não começar do zero.
3. Como responsável, quero escolher em quais Canais a Pauta sai e com qual Formato em cada um, para gerar só o que vou usar.
4. Como responsável, quero que o Claude sugira a Série de cada Post, para que a Arte saia no padrão visual certo.

**Roteiro e Legenda**
5. Como responsável, quero receber o Roteiro slide a slide (texto, indicação visual e Layout), para revisar antes de virar Arte.
6. Como responsável, quero editar Roteiro e Legenda direto no hub, para ajustar sem abrir arquivos.
7. Como responsável, quero aprovar o Roteiro, para disparar a geração da Arte.
8. Como responsável, quero exportar o Roteiro (copiar, `.md` ou PDF), para enviar ao designer quando a peça for especial.

**Arte**
9. Como responsável, quero que a Arte seja gerada automaticamente ao aprovar o Roteiro, no estilo da Série do Post.
10. Como responsável, quero ver a Arte num preview que imita o feed do Canal, para avaliar como vai ficar publicada.
11. Como responsável, quero pedir ajustes da Arte pelo chat ("slide 3 com fundo claro"), e ver a nova versão em seguida.
11a. Como responsável, quero editar a Arte gerada pela IA direto no hub (texto, posição, tamanho, cores, fundo, imagens e slides), para fazer ajustes pequenos na hora, sem esperar a IA.
12. Como responsável, quero fazer upload da Arte feita pelo designer, para que ela substitua a gerada pela IA.
13. Como responsável, quero baixar a Arte final (PNGs no Instagram, PDF no carrossel do LinkedIn) e copiar a Legenda, para publicar manualmente.

**Acompanhamento**
14. Como responsável, quero ver todos os Posts num Quadro por Status, para saber o que está travado e com quem.
15. Como responsável, quero ver os Posts num Calendário pela data planejada, para saber o que sai quando.
16. Como responsável, quero mudar o Status de um Post e definir a data planejada, para manter o Quadro e o Calendário corretos.
17. Como responsável, quero marcar um Post como publicado, para fechar o ciclo.
17a. Como responsável, quero excluir um Post ou a Pauta inteira (ex.: testes), com volta possível pela lixeira do workspace.
18. Como integrante do time, quero que tudo fique em arquivos do TatuOS, para usar sem o hub e ter histórico no GitHub.

### Regras

- **Canais e Formatos:** Instagram aceita carrossel, post único e story; LinkedIn aceita carrossel (PDF) e post único.
- **Status:** `rascunho` → `aprovado` → (`em-design`, só quando vai ao designer) → `pronto` → `publicado`. "Agendado" é um Post `pronto` com data planejada.
- **Dimensões:** carrossel e post único 1080×1350 (4:5); story 1080×1920 (9:16).
- **Identidade:** toda Arte segue `identidade/design-guide.md` e a Série do Post.
- **Sem fotos geradas por IA:** imagens vêm da Biblioteca de assets ou de fotos reais enviadas por upload.

### Fora do MVP

- Publicação automática e métricas do perfil (dependem de conta Instagram Business / API da Meta).
- Backlog automático de Pautas (depende do `/seo`).
- Acesso do designer ao hub (fase multiusuário).

### Pré-requisitos com o designer

- Biblioteca de assets exportada do Figma (logo claro/escuro, setas, asterisco, renders 3D, texturas, ilustrações, selos).
- Link "can view" do arquivo do Figma.
- 2–3 Roteiros reais com as peças que saíram deles.
- Respostas sobre tipografia do título e regra de alternância claro/escuro.

---

## Módulo Tráfego & Leads

### Problema

A prioridade número 1 da estratégia é tráfego pago com captação de leads: escolher palavras-chave, criar as campanhas, levar o clique para uma LP e converter no formulário. Hoje nada disso existe, e montar campanha no Google Ads à mão é lento e propenso a erro.

### Solução (MVP em etapas)

1. **Campanhas** ✅ — o Claude sugere Termos para pesquisar, o usuário traz a Pesquisa do Planejador, e a skill `/anuncio-google` monta a Campanha pronta para o Google Ads Editor.
2. **Landing Pages** ✅ geração — a skill `/landing-page` gera a LP do serviço (HTML único, responsivo, formulário com LGPD e captura de UTM/gclid), com preview desktop/celular e ajustes por texto no hub. *Publicação depende do levantamento.*
3. **Leads e funil** — leads com origem e funil `novo → em contato → reunião → proposta → ganho/perdido`. *Depende da decisão sobre CRM.*
4. **Relatórios de Ads** — relatório semanal a partir do CSV exportado do Google Ads (`/relatorio-ads`), quando a Campanha rodar.

### Histórias de usuário (Campanhas)

1. Como responsável pelo marketing, quero criar uma Campanha escolhendo o serviço da Stage, para anunciar cada frente separadamente.
2. Como responsável, quero que o Claude sugira os termos para pesquisar no Planejador, para não começar a pesquisa do zero.
3. Como responsável, quero enviar o CSV exportado do Planejador (como o Google entrega), para a Campanha se basear em volume e lance reais.
4. Como responsável, quero que o Claude monte Grupos, palavras-chave, Negativas e anúncios, respeitando os limites do Google, para importar sem retrabalho.
5. Como responsável, quero ver os anúncios como aparecem no Google e conferir o tamanho de cada título e descrição.
6. Como responsável, quero baixar os CSVs no formato do Google Ads Editor e um passo a passo de importação.
7. Como responsável, quero registrar a URL da LP e o Status da Campanha (rascunho, pronta, ativa, encerrada).

### Regras

- Tudo nasce **pausado**; quem ativa é o usuário no Google Ads.
- Nada de inventar volume ou CPC: sem Pesquisa com números, o Claude escolhe por aderência e avisa.
- Sem LP, os anúncios apontam para `https://stage.consulting/` e a Campanha avisa para trocar.
- Conversão do formulário configurada no Google Tag Manager (`GTM-5NDZ8J6`) antes de ativar.

### Decisões pendentes (levantamento com o time)

- Quem mantém o site stage.consulting (repositório Next.js, conta Vercel, DNS) → define onde a LP é publicada.
- Para onde vai hoje o formulário da home e se a Stage usa CRM → define onde os Leads ficam (funil próprio no hub com Supabase, CRM existente ou white label).
- Se existe política de privacidade publicada → necessária para o formulário (LGPD).

### Fora do MVP

- Integração com a API do Google Ads (exige conta ativa e aprovação de desenvolvedor).
- Meta Ads e LinkedIn Ads.
