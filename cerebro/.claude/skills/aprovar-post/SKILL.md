---
name: aprovar-post
description: >
  Confere uma peça de conteúdo antes de ir ao ar (marca, canal, texto e dados) e deixa pronta para
  publicar. Se o site da pessoa estiver num repositório do GitHub, publica o artigo direto no
  site. Use quando o usuário disser "aprovar", "pode publicar", "confere esse post", "subir no
  site", "/aprovar-post".
---

# /aprovar-post

Nada vai ao ar sem passar pela conferência. A publicação no site é opcional e só acontece com o
"sim" do usuário na hora.

## 1. Qual peça

Se o usuário não disse, listar as pastas de `entregas/posts/` e `entregas/conteudo/` com peças em
`situacao: rascunho` (ou sem `aprovado.md`) e perguntar qual.

## 2. Conferência

Passar por cada item e mostrar o resultado numa tabela (✅ ok · ⚠️ ajustar · ❌ bloqueia):

| Área | O que conferir |
|---|---|
| Marca | Cores e fontes de `marca/guia-visual.md`, logo no lugar certo, contraste legível |
| Canal | Medidas e limites de `marca/canais.md` (tamanho da imagem, nº de telas, caracteres da legenda) |
| Texto | Tom de `contexto/voz.md`, nenhuma palavra da lista "O que evitar", ortografia e acentos |
| Dados | Todo número tem fonte; nenhuma promessa que o negócio não cumpre |
| Chamada | Uma ação só, a mesma na peça e na legenda, link funcionando |
| Acessibilidade | Texto alternativo nas imagens |
| Artigo (se houver) | Título, descrição até 155 caracteres, palavra-chave no título e no primeiro parágrafo |

- Corrigir na hora o que for simples (acento, tamanho, legenda longa) e dizer o que foi corrigido.
- O que depende do usuário (dado sem fonte, promessa duvidosa) vira pergunta.
- Com ❌ em aberto, a peça não é aprovada.

## 3. Aprovar

- Artigo: mudar `situacao: rascunho` para `situacao: aprovado`.
- Peças de rede: criar `aprovado.md` na pasta com a data, quem aprovou e o resultado da conferência.
- Montar `publicar.md` na pasta: para cada canal, o arquivo de imagem, a legenda pronta para
  copiar e o horário sugerido (se o contexto tiver essa informação).

## 4. Publicar

Perguntar onde vai ao ar.

### Redes sociais e blog fora do GitHub

O pacote do passo 3 já está pronto para a pessoa postar (ou agendar na ferramenta que usar).
Depois que ela confirmar que publicou, registrar a data e o link em `aprovado.md`.

### Site no GitHub (publicação direta)

Para quem tem o site num repositório do GitHub com publicação automática (Netlify, Vercel,
GitHub Pages, Cloudflare Pages e parecidos).

**Na primeira vez**, preencher `contexto/site.md` com o usuário (e conferir no repositório):

```markdown
# Site
- Repositório: [dono/nome]
- Pasta local: [caminho onde o repositório está clonado]
- Branch publicada: [main]
- Pasta dos artigos: [ex.: src/content/blog/]
- Formato do artigo: [markdown com cabeçalho · mdx · outro], e os campos que o site espera
- Pasta das imagens: [ex.: public/blog/]
- Endereço do blog: [https://...]
```

Ler 2 artigos que já existem no site para copiar o formato exato (campos do cabeçalho, nome do
arquivo, caminho das imagens). Isso vale mais do que qualquer suposição.

**Para publicar:**
1. `git -C <pasta local> pull` para partir da versão atual do site.
2. Converter o `artigo.md` para o formato do site (campos do cabeçalho, nome do arquivo) e copiar
   para a pasta dos artigos. Copiar as imagens e ajustar os caminhos dentro do texto.
3. Mostrar o que vai mudar no site (arquivos novos) e **pedir o "sim"**.
4. Commit no repositório do site (`Publica: [título]`) e push na branch publicada. Nunca `--force`.
5. Esperar a publicação (até 5 minutos) e abrir o endereço do artigo para confirmar que está no
   ar. Se não aparecer, mostrar o status do deploy e não dar como publicado.
6. Mudar o artigo do TatuOS para `situacao: publicado` e registrar o link em `aprovado.md`.

## Resposta

```
[Peça] aprovada · [N] ajustes feitos
Pacote: entregas/.../publicar.md
No ar: [link] · ou: pronto para você postar
```
