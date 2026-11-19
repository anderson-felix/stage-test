# Página do LinkedIn lida do JSON-LD público, até a API oficial

A aba Social → LinkedIn mostra a página real da Stage (`br.linkedin.com/company/stageconsulting`). A página pública da empresa, aberta sem login, traz um bloco JSON-LD com a `Organization` (nome, slogan, descrição, endereço, funcionários, logo) e os posts recentes como `SocialMediaPosting` (texto, data, curtidas, link). O servidor do hub lê esse bloco com um `fetch` simples, sem navegador, e guarda uma cópia em `marketing/social/_perfis/linkedin/`, atualizada por botão e quando passa de um dia, como no Instagram ([ADR 0010](0010-feed-instagram-pelo-perfil-publico.md)).

## Considered Options

- **API oficial do LinkedIn (Community Management):** é o destino, porque traz métricas e permite publicar. Exige app aprovado pelo LinkedIn e um administrador da página; leva dias ou semanas.
- **Abrir com o Chromium, como no Instagram:** desnecessário; o HTML já vem com os dados, e um `fetch` é mais leve e não depende do Playwright.
- **Mostrar a página num iframe:** o LinkedIn não permite.

## Consequences

- Os carrosséis em PDF (a maioria dos posts da Stage) aparecem como texto: a página pública não traz imagem deles. Posts de imagem têm a foto baixada.
- O LinkedIn pode passar a pedir login; aí a tela mostra a última cópia com aviso.
- Quando a API oficial entrar, só `src/lib/linkedin.ts` muda; a tela e o formato de `feed.json` continuam.
