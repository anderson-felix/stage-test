# Ads

Campanhas de tráfego pago da Stage. Cada Campanha fica em `campanhas/<data>-<slug>/` (montada pelo Stage Hub com a skill `/anuncio-google`).

## Planejador de palavras-chave sem cadastrar cartão

Conta Google Ads comum criada em 2026 fica presa na tela "Confirmar configurações da conta e de pagamento"; até o link direto do Planejador redireciona para lá.

Caminho que funcionou (2026-10-07): criar uma **conta de administrador (MCC)** em https://ads.google.com/home/tools/manager-accounts/. Ela não pede pagamento e tem **Ferramentas → Planejamento → Planejador de palavras-chave**. Sem gasto em mídia, os volumes aparecem em faixas (ex.: "1 mil – 10 mil"); o hub entende esse formato no upload da Pesquisa.

Para ativar Campanhas de verdade, a conta com pagamento continua necessária.
