# Plano de Implementação — Stage Hub

Fases do produto e as etapas do módulo em andamento. Cada etapa vira issue no GitHub (`tatucotech/stage-hub`); esta página é o mapa. O percentual concluído, com peso por item e histórico por dia, fica em [PROGRESSO.md](PROGRESSO.md); o registro de cada dia, em [diario/](diario/).

## Fases do produto

| # | Fase | Estado |
|---|---|---|
| 1 | MVP: login, Visão Geral, chat com Claude, explorador de arquivos | ✅ 2026-10-06 |
| 2 | **Social:** Pautas, Roteiro, Arte gerada pela IA, Quadro, Calendário, Instagram, LinkedIn | ✅ 2026-10-07 a 2026-10-14 (falta S0: material do designer) |
| 3 | **Tráfego & Leads:** Campanhas, leads e funil, relatórios de Ads | 🔄 Em andamento |
| 4 | **Site & LPs:** LPs com Finalidade (Ads ou Página do site), site ao vivo; publicação direta, editor de página, SEO | 🔄 LPs e preview entregues |
| 5 | Multiusuário, chave de API da Anthropic, deploy em VPS com Docker | 🔄 Logins e pacote de deploy prontos ([DEPLOY](DEPLOY.md)); falta contratar a VPS e aprovar a chave de API |
| 6 | **Estúdio:** biblioteca de Posts, edição de Artes, Templates, edição de vídeo | ⏳ Em breve (Aba visível desde 2026-10-14) |
| 7 | **Integrações oficiais:** APIs do Instagram e do LinkedIn (agendar, publicar, métricas), Monday | ⏳ Roadmap aprovado em 2026-10-14 |

## Fase 2 — Social

| # | Etapa | Entrega | Depende de |
|---|---|---|---|
| S0 | Material do designer | Biblioteca de assets em `identidade/assets/`, `identidade/series.md`, Roteiros reais de referência | Designer |
| S1 ✅ | Quadro (leitura) | `src/lib/social.ts` lê os Posts; Quadro por Status com Posts de exemplo | — |
| S2 ✅ | Nova Pauta + `/roteiro` | Skill `/roteiro` no TatuOS; modal Nova Pauta cria Pauta e Posts em `rascunho` | S1 |
| S3 ✅ | Detalhe do Post | Editar Roteiro/Legenda, mudar Status e data, exportar Roteiro | S1 |
| S4 ✅ | Arte gerada pela IA | `/carrossel` Modo Hub; render Playwright no servidor; preview no estilo do feed | S3 (S0 refina) |
| S5 ✅ | Ajuste pelo chat | Campo "Pedir ajuste à IA" no painel da Arte, com re-render (chat livre fica para depois) | S4 |
| S6 ✅ | Designer + Calendário | Upload da Arte, Calendário mensal, marcar publicado | S3 |
| S7 ✅ | Editor de Arte | Editar a Arte da IA no hub (texto, posição, cores, fundo, imagens, slides) e re-renderizar — [ADR 0008](adr/0008-editor-de-arte-sobre-o-html.md) | S4 |
| S8 ✅ | Instagram no hub | Feed real de @stage.consulting lido do perfil público, pré-visualização dos planejados, link do post publicado — [ADR 0010](adr/0010-feed-instagram-pelo-perfil-publico.md). Próximo: API oficial (conta já é Profissional) | S6 |
| S9 ✅ | LinkedIn no hub | Página real da Stage (seguidores, funcionários, posts recentes com curtidas) lida do JSON-LD público; Posts de LinkedIn planejados ao lado — [ADR 0011](adr/0011-linkedin-pela-pagina-publica.md) | S8 |

## Fase 3 — Tráfego & Leads

| # | Etapa | Entrega | Depende de |
|---|---|---|---|
| T0 | Levantamento com o time | Quem mantém o site (repositório, Vercel, DNS), destino do formulário atual, CRM em uso, política de privacidade | Usuário |
| T1 ✅ | Campanhas | Termos sugeridos, upload da Pesquisa do Planejador, `/anuncio-google` Modo Hub, preview dos anúncios, CSVs para o Ads Editor | — |
| T2 ✅ | LP: gerar e revisar | LP por serviço gerada pela IA (texto + layout da marca + formulário), preview no hub; Finalidade Ads ou Página do site — [ADR 0012](adr/0012-finalidade-da-lp.md) | — |
| T3 | LP: publicar | Integração com o servidor de hospedagem do site: publicar a página ou LP aprovada direto pelo hub, com conversão no GTM | T0, T2 |
| T4 | Leads e funil | Leads do formulário com origem (UTM/Campanha) e funil; funil próprio (Supabase), CRM existente ou white label | T0, T3 |
| T5 | Relatórios de Ads | Upload do CSV do Google Ads → `/relatorio-ads` → relatório semanal no hub | Campanha ativa |

## Pendências fora do código

- Levantamento T0 (acima).
- Material e respostas do designer (S0).
- Conta Google Ads com pagamento para ativar Campanhas.
- Aprovar a chave de API da Anthropic (custo por uso) e contratar a VPS: só então o hub sobe para o time.

## Ideias para a fase multiusuário

- Botão "guardar na memória da Stage" no chat do hub: transforma um aprendizado da conversa em atualização de `_memoria/` (preferências, estratégia) no workspace, para valer para todo o time. Conversas do chat não viram memória sozinhas.
- Commit automático do workspace no GitHub a partir do servidor, como backup e histórico.
