<!-- Instância da Stage: usado quando o pedido cita uma pasta de marketing/ads/campanhas/ (vem do Stage Hub). -->

# Modo Hub (Campanha do Tráfego & Leads)

A Stage é B2B nacional: vende consultoria para empresas médias e grandes. Não é negócio local — ignorar raio em km, WhatsApp, ligação e extensão de chamada.

## Ler antes

1. `contexto/negocio.md`, `contexto/voz.md`, `contexto/foco.md`
2. `<campanha>/campanha.md` — frontmatter (`servico`, `objetivo`, `orcamento_diario`, `regiao`, `lp_url`) e briefing
3. `<campanha>/pesquisa/palavras-chave.csv`, se existir — colunas `palavra,volume,volume_min,volume_max,concorrencia,lance_min,lance_max` (normalizado pelo hub a partir do Planejador de palavras-chave)

## Tarefa A — Sementes (quando o pedido for "gerar sementes")

Não existe pesquisa ainda. Gravar `<campanha>/pesquisa/sementes.md` com 30 a 50 termos para o usuário colar no Planejador de palavras-chave, agrupados por intenção (contratar consultoria, problema de negócio, solução/tecnologia). Só termos com intenção comercial; nada de "o que é", "curso", "vaga", "grátis". Uma linha por termo, sem marcadores, dentro de cada grupo `## <grupo>`, para facilitar copiar. Não gravar mais nada.

## Tarefa B — Montar a campanha (quando o pedido for "montar a campanha")

1. **Escolher os termos** a partir de `palavras-chave.csv`: intenção comercial, ligados ao `servico`, priorizando volume e lance coerentes. Descartar informacionais, marcas de concorrentes e termos de emprego. Termo sem volume só entra se for muito específico do serviço.
2. **Agrupar** em 3 a 6 Grupos de anúncios (um tema de busca por grupo, 5 a 15 palavras por grupo).
3. **Escrever** 2 RSAs por grupo: 15 headlines (até 30 caracteres) e 4 descriptions (até 90). Tom de `contexto/voz.md`; sem superlativo sem prova; clientes citados só os de `contexto/negocio.md` e só como prova genérica ("atendemos empresas como…" não; "consultoria de grandes empresas" sim).
4. **Negativas**: lista global obrigatória (emprego, vaga, curso, grátis, o que é, pdf, salário, estágio…) + negativas por grupo quando dois grupos disputarem o mesmo termo.
5. **Gravar** em `<campanha>/ads-editor/` os arquivos abaixo, UTF-8, separador vírgula, aspas quando o valor tiver vírgula. Tudo começa **Paused**.

| Arquivo | Colunas (cabeçalho exato) |
|---|---|
| `campanhas.csv` | `Campaign,Campaign Type,Budget,Bid Strategy Type,Networks,Languages,Location,Campaign Status` |
| `grupos.csv` | `Campaign,Ad Group,Ad Group Status` |
| `keywords.csv` | `Campaign,Ad Group,Keyword,Criterion Type,Status` (Criterion Type: `Phrase` na maioria, `Exact` para os termos mais valiosos) |
| `keywords-negativas.csv` | `Campaign,Ad Group,Keyword,Criterion Type` (Ad Group vazio = negativa da campanha; Criterion Type `Negative Phrase` ou `Negative Exact`) |
| `anuncios.csv` | `Campaign,Ad Group,Ad Type,Headline 1,…,Headline 15,Description 1,…,Description 4,Final URL,Path 1,Path 2,Status` (Ad Type `Responsive search ad`) |
| `extensoes-sitelinks.csv` | `Campaign,Sitelink Text,Description Line 1,Description Line 2,Final URL` (4 sitelinks de páginas reais de stage.consulting) |

   Valores fixos: `Campaign Type` = `Search`; `Bid Strategy Type` = `Maximize conversions`; `Networks` = `Google search`; `Languages` = `pt`; `Location` = `regiao` do frontmatter (padrão `Brazil`); `Budget` = `orcamento_diario` (vazio se não houver). `Final URL` = `lp_url`; se vazio, `https://stage.consulting/` e avisar no resumo que deve ser trocado pela LP.

6. **Completar** `<campanha>/campanha.md`: manter o frontmatter como está e escrever no corpo as seções `## Estratégia` (público, por que esses grupos, o que ficou de fora), `## Antes de ativar` (conversão do formulário no Google Tag Manager `GTM-5NDZ8J6`, LP no ar, orçamento) e `## Como importar` (passo a passo do Google Ads Editor).

**Done** quando: cada grupo de `grupos.csv` tem palavras em `keywords.csv` e 2 linhas em `anuncios.csv`; nenhuma headline passa de 30 caracteres nem description de 90; existe negativa global; tudo `Paused`.

Responder em uma linha: número de grupos, palavras-chave, negativas e anúncios.
