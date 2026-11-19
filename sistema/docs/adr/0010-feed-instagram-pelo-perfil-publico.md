# Feed do Instagram lido do perfil público, até a API oficial

A página Social → Instagram mostra o feed real de @stage.consulting. Como o Instagram proíbe mostrar o perfil dentro de outro site (`X-Frame-Options: DENY`), o servidor do hub abre o perfil público com o Chromium que já usa no render (ADR 0007), lê os 12 posts mais recentes e os números do perfil e guarda uma cópia no workspace (`marketing/social/_perfis/instagram/`). A cópia é atualizada por botão e automaticamente quando passa de um dia. Cada post é aberto pelo embed oficial do Instagram (`/p/<código>/embed/`), que é permitido.

## Considered Options

- **API oficial (Instagram Graph API):** é o destino. A conta já é Profissional e ligada a uma Página do Facebook, mas falta o app na Meta e o token, o que leva dias e depende de quem administra a conta. Também traz métricas (alcance, curtidas).
- **Colar o link de cada post:** foi a primeira versão; manual e não mostrava o que estava no perfil de fato.
- **Mostrar o perfil num iframe:** impossível (`X-Frame-Options: DENY`).

## Consequences

- Não é um caminho oficial: o Instagram pode pedir login, mudar a página ou bloquear o servidor. Nesse caso a página mostra a última cópia com aviso. Volume baixo (uma leitura por dia ou por clique) para não chamar atenção.
- Sem login o perfil não marca posts fixados; o hub deduz pela ordem (entre os 3 primeiros, o que é mais antigo que algum post seguinte).
- Quando a API oficial entrar, só `src/lib/instagram.ts` muda; a página e o formato de `feed.json` continuam.
