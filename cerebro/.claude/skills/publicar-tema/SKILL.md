---
name: publicar-tema
description: >
  Transforma um tema em um pacote de conteúdo: artigo para o blog e as peças das redes que saem
  dele (carrossel, post do LinkedIn, roteiro curto de vídeo), tudo no tom da marca e ligado ao
  foco do momento. Use quando o usuário disser "publicar tema", "conteúdo sobre", "faz um artigo
  e os posts", "pauta da semana", "/publicar-tema".
---

# /publicar-tema

Um tema bem trabalhado rende uma semana de conteúdo. O artigo é a peça-mãe: as redes recortam
partes dele e levam para ele.

## 1. Tema e ângulo

- Ler `contexto/` (negócio, voz, foco, glossário) e `marca/canais.md`.
- Se o usuário trouxe um tema, propor **3 ângulos** em uma linha cada, com o público e a pergunta
  que o artigo responde. Ex.: "Para quem nunca fez check-up: o que acontece numa consulta de
  rotina, passo a passo".
- Se não trouxe tema, sugerir 3 a partir de `contexto/foco.md` e das perguntas que os clientes
  fazem (perguntar quais são, se não estiver no contexto).
- **Busca de palavras** (opcional, quando o blog serve para trazer gente do Google): listar 3 a 5
  formas como as pessoas pesquisam esse assunto e escolher uma principal. Se houver `/seo` no
  workspace, usar a pesquisa dela.

## 2. Pauta (aprovar antes de escrever)

Mostrar numa tabela curta e esperar o "ok":

| Peça | Formato | O que leva |
|---|---|---|
| Artigo | 800 a 1.400 palavras | Título, subtítulos, a resposta principal no primeiro parágrafo |
| Carrossel | 5 a 8 telas | O ponto mais útil do artigo |
| LinkedIn | Texto de 150 a 250 palavras | Uma opinião ou um dado do artigo |
| Vídeo curto | Roteiro de 30 a 45 s | Gancho, 3 passos, chamada |

O usuário pode tirar ou trocar peças.

## 3. Escrever o artigo

Salvar em `entregas/conteudo/AAAA-MM-DD-tema-curto/artigo.md`:

```markdown
---
titulo: ""
descricao: ""          # até 155 caracteres, para o Google e para a prévia do link
palavra_chave: ""
data: AAAA-MM-DD
situacao: rascunho     # rascunho · aprovado · publicado
imagem_capa: ""
---
```

- A resposta que a pessoa procura no **primeiro parágrafo**. O resto aprofunda.
- Subtítulos que, lidos sozinhos, já contam o artigo.
- Parágrafos de até 4 linhas, listas quando houver passos.
- Dado só com fonte, com link. Sem fonte, não entra.
- No fim, a chamada que leva ao objetivo do negócio (agendar, comprar, falar no WhatsApp).

## 4. Derivar as peças

Na mesma pasta:
- **Carrossel:** seguir o `/carrossel` a partir do roteiro tirado do artigo, gerando os PNGs e a
  `legenda.md`.
- **LinkedIn:** `linkedin.md`. Abre com uma frase que pare a rolagem, desenvolve um ponto só,
  termina com uma pergunta ou com o link do artigo.
- **Vídeo:** `roteiro-video.md` com tempo de cada parte, o que aparece na tela e o que é falado.

Toda peça aponta para o artigo quando o canal permitir link.

## Entrega

```
Pacote pronto · [tema]
Pasta: entregas/conteudo/<pasta>/
Peças: artigo (N palavras) · carrossel (N telas) · LinkedIn · vídeo
Próximo passo: /aprovar-post para conferir e publicar
```
