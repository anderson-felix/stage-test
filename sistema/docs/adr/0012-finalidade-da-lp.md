# A LP tem uma Finalidade: Campanha de Ads ou Página do site

Nem toda página gerada pela IA vai receber tráfego pago: muitas são matérias para o site, que nunca serão impulsionadas. Por isso cada LP tem um campo `finalidade` no `lp.md`: `campanha` (LP de mídia paga, pode ficar atrelada a uma Campanha, `noindex`, repete a promessa dos anúncios) ou `site` (página ou matéria indexável, formulário no fim, nunca atrelada a Campanha). A escolha é a primeira pergunta do modal Nova LP e pode ser trocada depois na tela da LP. LPs antigas, sem o campo, contam como `campanha`. As telas das LPs passaram de Tráfego & Leads para Site & LPs, porque a página pertence ao site, com ou sem Campanha.

## Considered Options

- **Só a Campanha opcional (como era):** o select ficava escondido quando não havia Campanhas e não deixava claro que a página podia ser conteúdo do site; a skill gerava tudo como LP de Ads (`noindex`).
- **Dois módulos separados (LPs e Páginas):** duplicaria tela, rotas e skill para uma diferença de propósito.

## Consequences

- A skill `/landing-page` lê a `finalidade` e muda a estrutura e o `robots` da página.
- Trocar a Finalidade ou a Campanha de uma LP já gerada só vale para o conteúdo depois de "Gerar do zero".
