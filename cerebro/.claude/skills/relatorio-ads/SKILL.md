---
name: relatorio-ads
description: >
  Relatório semanal ou mensal de anúncios pagos (Google Ads e Meta Ads) a partir das exportações ou
  prints: quanto foi investido, o que voltou, o que melhorou ou piorou, os melhores e piores
  anúncios e o que fazer na próxima semana. Guarda o histórico para comparar. Use quando o usuário
  disser "relatório de anúncios", "como foram os ads", "resultado da campanha", "/relatorio-ads".
---

# /relatorio-ads

O relatório responde a três perguntas: **valeu o que custou? o que mudou? o que fazemos agora?**
Número sem comparação não diz nada; por isso o relatório sempre olha o período anterior.

## 1. Os dados

- Procurar em `entrada/` as exportações do período (CSV ou planilha do Google Ads e do
  Gerenciador de Anúncios da Meta). Prints também servem: transcrever os números e dizer que veio
  de print.
- Se não houver nada, explicar em 3 linhas como exportar:
  - **Google Ads:** Campanhas → período → ícone de download → CSV. Repetir em Anúncios.
  - **Meta:** Gerenciador de Anúncios → nível Anúncios → período → Exportar → CSV.
- Confirmar o período e o que conta como **resultado** para o negócio (venda, agendamento,
  formulário, mensagem). Usar sempre a mesma definição; se mudar, avisar no relatório.

## 2. Os números

Por plataforma e no total:

| Indicador | Conta |
|---|---|
| Investimento | soma do valor gasto |
| Resultados | conversões do tipo definido |
| Custo por resultado | investimento ÷ resultados |
| Cliques e taxa de clique | cliques ÷ impressões |
| Custo por clique | investimento ÷ cliques |
| Taxa de conversão | resultados ÷ cliques |
| Retorno (se houver receita) | receita ÷ investimento |

- Comparar com o período anterior lido de `entregas/relatorios/ads-historico.csv`. Variação em
  percentual e com seta (▲ ▼).
- **Não somar** conversões de plataformas diferentes como se fossem a mesma coisa sem avisar: cada
  uma conta do seu jeito, e a mesma venda pode aparecer nas duas.

## 3. Os anúncios

- **Melhores 3 e piores 3** por custo por resultado, só entre os que gastaram pelo menos 10% do
  total (evita conclusão com volume pequeno).
- Para cada um, o porquê provável: público, criativo, oferta, página de destino.
- Sinais de alerta: frequência acima de 3 na Meta (o público está cansando), termos de busca
  irrelevantes gastando no Google, orçamento esgotando antes do fim do dia.

## 4. O que fazer

De 3 a 5 ações, cada uma com o que mudar, o motivo (o número que sustenta) e o resultado
esperado. Ex.: "Pausar o anúncio X: custo por agendamento de R$ 84, o dobro da média, há 2
semanas." Nada de "otimizar a campanha".

## 5. Salvar

- `entregas/relatorios/ads-AAAA-MM-DD.md` com: resumo em 3 linhas, tabela de números com a
  variação, melhores e piores, alertas e ações.
- Acrescentar uma linha por plataforma em `entregas/relatorios/ads-historico.csv`:
  ```
  periodo_inicio,periodo_fim,plataforma,investimento,impressoes,cliques,resultados,receita
  ```
  Criar o arquivo com o cabeçalho se não existir.
- Na semana seguinte, conferir se as ações da semana anterior foram feitas e o que aconteceu.

## Resposta

```
Anúncios · DD/MM a DD/MM
Investimento R$ X (▲▼ N%) · N resultados (▲▼ N%) · R$ X por resultado (▲▼ N%)
Destaque: [o melhor anúncio e por quê]
Atenção: [o principal alerta]
Ações: 1. … 2. … 3. …
Relatório: entregas/relatorios/<arquivo>
```
