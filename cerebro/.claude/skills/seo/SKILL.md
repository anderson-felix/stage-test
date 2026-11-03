---
name: seo
description: >
  Diagnóstico e plano para o negócio ser encontrado em três lugares: na busca do Google, no mapa
  (Perfil da Empresa no Google) e nas respostas de assistentes de IA. Sai com as correções do site,
  as pautas de conteúdo e as palavras para anúncio. Use quando o usuário disser "seo", "aparecer
  no Google", "ranquear", "Google Meu Negócio", "aparecer no ChatGPT", "/seo".
---

# /seo

Quem procura já quer comprar: SEO é chegar na frente na hora da procura. O trabalho tem três
frentes, e o diagnóstico mostra qual delas dá mais retorno para este negócio agora.

| Frente | Para quem importa mais |
|---|---|
| **Busca** (resultados do Google) | Quem vende para o Brasil todo ou tem conteúdo para ensinar |
| **Mapa** (Perfil da Empresa) | Quem atende num endereço ou numa região |
| **Respostas de IA** (ChatGPT, Gemini, resumos do Google) | Todos, e cresce rápido |

## 1. Entender o negócio

Ler `contexto/negocio.md` e `contexto/foco.md`. Confirmar (uma pergunta por vez, só o que faltar):
- O endereço do site e se o negócio atende no local, em domicílio ou só online.
- As cidades ou regiões atendidas.
- Os 3 produtos ou serviços que mais importam para o caixa.
- Até 3 concorrentes que o usuário conhece.
- Se há acesso ao Google Search Console ou ao Perfil da Empresa (exportações vão em `entrada/`).

## 2. Demanda: como as pessoas procuram

Para cada produto ou serviço principal:
- Listar de 10 a 20 formas reais de procurar, separadas pela intenção: **comprar agora**
  ("exame de sangue perto de mim"), **comparar** ("melhor laboratório em Curitiba"), **aprender**
  ("o que é hemograma").
- Usar a busca na web para conferir como o Google responde: o que aparece no topo, se tem mapa,
  perguntas relacionadas e resumo de IA.
- Volume de busca só com fonte (Search Console, Planejador de Palavras-chave ou outra ferramenta).
  Sem fonte, classificar como alta, média ou baixa **pela evidência** e dizer que é estimativa.

## 3. Concorrência

Para as 5 buscas de "comprar agora" mais importantes: quem aparece, que página aparece (home,
página de serviço, artigo) e o que ela tem que o site do usuário não tem. Conclusão em 3 linhas.

## 4. Diagnóstico do site

Abrir as páginas principais (home e páginas de produto ou serviço) e conferir:

| Item | O que olhar |
|---|---|
| Uma página por serviço | Cada serviço importante tem página própria, com o nome que as pessoas buscam |
| Título e descrição | Título com o serviço e a cidade; descrição que convida ao clique |
| Primeiro parágrafo | Responde de cara o que é, para quem e onde |
| Contato | Endereço, telefone e horário iguais em todo lugar (site, mapa, redes) |
| Perguntas frequentes | Respostas curtas e diretas, que as IAs conseguem citar |
| Dados estruturados | Marcação de empresa local, serviço e perguntas frequentes |
| Velocidade e celular | Abre rápido e funciona bem no celular |

## 5. Mapa (se atende num endereço)

Conferir o Perfil da Empresa: categoria principal certa, serviços cadastrados, fotos recentes,
horário, frequência de avaliações e se elas são respondidas (`/responder-avaliacoes`, se existir).

## 6. Respostas de IA

Perguntar a um assistente de IA, como um cliente perguntaria, "qual o melhor [serviço] em
[cidade]" e anotar se o negócio aparece e quem aparece. O que ajuda a aparecer:
- informação igual e completa em todo lugar (site, mapa, diretórios do setor);
- páginas que respondem perguntas de forma direta;
- ser citado por fontes que as IAs leem (imprensa local, associações, diretórios).

## 7. Plano

Salvar em `entregas/seo/AAAA-MM-DD-diagnostico.md`:

```markdown
# SEO — diagnóstico de DD/MM/AAAA

## Em 3 linhas
## Onde está o maior retorno
## Correções no site (por impacto)
| Página | O que mudar | Impacto | Esforço |
## Mapa
## Respostas de IA
## Pautas de conteúdo (próximos 90 dias)
| Pauta | Busca que responde | Intenção | Prioridade |
## Palavras para anúncio
## Como medir
```

- As pautas alimentam o `/publicar-tema`.
- As palavras de "comprar agora" alimentam o `/anuncio-google`.
- Medir pelo que existe: cliques e posição no Search Console, ligações e rotas no Perfil da
  Empresa, contatos que vieram do site.

## Resposta

```
Diagnóstico pronto · entregas/seo/<arquivo>
Maior retorno: [frente] — [por quê, em uma linha]
Top 3 ações: 1. … 2. … 3. …
Próximo passo: /publicar-tema com a primeira pauta, ou /anuncio-google
```
