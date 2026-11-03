# Progresso — Stage Hub

Quanto do escopo do hub está pronto, medido em **sessões** (meio dia de trabalho). Atualizado pela skill `/encerrar` no fim de cada dia; lido pela `/abrir` no começo. O registro de cada dia fica em [diario/](diario/).

## Configuração

| Campo | Valor |
|---|---|
| Prazo | **a definir** (AAAA-MM-DD) |
| Capacidade | 2 sessões por dia útil (dia inteiro no hub) |
| Dias úteis | segunda a sexta |

## Placar

**38%** ███████░░░░░░░░░░░░░ · 20 de 52 sessões · faltam 32

Ritmo necessário: — (defina o prazo acima)

## Como calcular

- **Percentual** = soma dos pesos dos itens concluídos ÷ soma de todos os pesos, arredondado para baixo.
- **Barra** = 20 blocos; cada bloco vale 5% (`█` concluído, `░` falta). Blocos cheios = percentual ÷ 5, arredondado para baixo.
- **Ritmo necessário** = sessões que faltam ÷ dias úteis de amanhã até o prazo (inclusive).
- **Veredito** do ritmo, comparando com a capacidade: até 80% dela = **folgado**; até 100% = **no limite**; acima = **atrasado** (falta escopo para cortar ou prazo para estender).
- **Escopo cresceu**: item novo entra na tabela com a data em "Entrou em"; no histórico, o peso novo do dia vai na coluna própria, para separar avanço de crescimento.
- Item parcialmente feito conta como não concluído. Para medir avanço parcial, divida o item em dois.

## Escopo

| # | Item | Aba | Peso | Status | Entrou em | Concluído em |
|---|---|---|---|---|---|---|
| 1 | MVP: login, Visão Geral, chat com o Claude, explorador de arquivos | Base | 2 | ✅ | 2026-10-06 | 2026-10-06 |
| 2 | S1 Quadro por Status | Social | 1 | ✅ | 2026-10-07 | 2026-10-07 |
| 3 | S2 Nova Pauta + `/roteiro` + Sugerir Pautas | Social | 1 | ✅ | 2026-10-07 | 2026-10-07 |
| 4 | S3 Detalhe do Post (Roteiro, Legenda, Status, exportar) | Social | 1 | ✅ | 2026-10-07 | 2026-10-07 |
| 5 | S4+S5 Arte gerada pela IA, render no servidor, ajuste por texto | Social | 2 | ✅ | 2026-10-07 | 2026-10-07 |
| 6 | S6 Calendário, upload da Arte do designer, marcar publicado | Social | 1 | ✅ | 2026-10-07 | 2026-10-07 |
| 7 | T1 Campanhas Google Ads | Tráfego & Leads | 2 | ✅ | 2026-10-07 | 2026-10-07 |
| 8 | T2 Landing Pages: gerar e revisar | Site & LPs | 2 | ✅ | 2026-10-07 | 2026-10-07 |
| 9 | S7 Editor de Arte | Social | 2 | ✅ | 2026-10-08 | 2026-10-08 |
| 10 | Logins por pessoa (admin e membro) | Base | 1 | ✅ | 2026-10-08 | 2026-10-08 |
| 11 | Progresso das gerações da IA + lixeira | Base | 1 | ✅ | 2026-10-08 | 2026-10-08 |
| 12 | Pacote de deploy (Docker, Caddy, guia) | Base | 1 | ✅ | 2026-10-08 | 2026-10-08 |
| 13 | S8 Instagram real no hub | Social | 1 | ✅ | 2026-10-08 | 2026-10-08 |
| 14 | Finalidade da LP + LPs em Site & LPs | Site & LPs | 1 | ✅ | 2026-10-14 | 2026-10-14 |
| 15 | S9 LinkedIn real no hub + Estúdio "em breve" | Social | 1 | ✅ | 2026-10-14 | 2026-10-14 |
| 16 | Hub na VPS com a chave de API da Anthropic (time usando) | Base | 2 | ⏳ | 2026-10-08 | |
| 17 | S0 Material do designer aplicado (assets, Séries) | Social | 1 | ⏳ | 2026-10-07 | |
| 18 | T3 Publicação direta no servidor de hospedagem do site | Site & LPs | 3 | ⏳ | 2026-10-07 | |
| 19 | Editor de página da LP | Site & LPs | 2 | ⏳ | 2026-10-14 | |
| 20 | Painel de SEO | Site & LPs | 2 | ⏳ | 2026-10-14 | |
| 21 | T4 Leads e funil ligados ao Monday | Tráfego & Leads | 3 | ⏳ | 2026-10-07 | |
| 22 | T5 Relatório semanal de Ads | Tráfego & Leads | 2 | ⏳ | 2026-10-07 | |
| 23 | API oficial do Instagram (agendar, publicar, métricas) | Social | 3 | ⏳ | 2026-10-08 | |
| 24 | API oficial do LinkedIn (métricas, publicar) | Social | 2 | ⏳ | 2026-10-14 | |
| 25 | Visão Geral com os números de Social e Tráfego | Base | 1 | ⏳ | 2026-10-14 | |
| 26 | Estúdio: biblioteca de Posts com edição de Artes | Estúdio | 2 | ⏳ | 2026-10-14 | |
| 27 | Estúdio: Templates de post | Estúdio | 2 | ⏳ | 2026-10-14 | |
| 28 | Estúdio: edição de vídeo (Reels, Stories) | Estúdio | 4 | ⏳ | 2026-10-14 | |
| 29 | Claude Code: enviar arquivos e histórico de conversas | Claude Code | 2 | ⏳ | 2026-10-14 | |
| 30 | "Guardar na memória da Stage" pelo chat | Claude Code | 1 | ⏳ | 2026-10-08 | |

Pesos estimados em 2026-10-14; revisar quando o item começar.

## Histórico

| Data | Concluído (sessões) | Total (sessões) | % | Avanço no dia (p.p.) | Escopo cresceu (sessões) | Nota |
|---|---|---|---|---|---|---|
| 2026-10-14 | 20 | 52 | 38% | — | — | Linha de base: escopo montado com o roadmap aprovado pelo dono da Stage. Dias anteriores no CHANGELOG |
