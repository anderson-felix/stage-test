---
name: atualizar-contexto
description: >
  Revisa os arquivos de contexto do TatuOS (negócio, voz, foco, glossário, marca e o CLAUDE.md)
  contra o que aconteceu desde a última revisão e propõe as atualizações. Use quando o usuário
  disser "atualizar contexto", "o contexto está desatualizado", "revisa a memória", "mudou muita
  coisa", "/atualizar-contexto", ou uma vez por mês.
---

# /atualizar-contexto

O contexto envelhece sem ninguém perceber: o foco mudou, um produto saiu, uma regra nova foi
decidida. Contexto velho faz o Claude errar com confiança.

## 1. Desde quando

Ler a linha `Revisado em` no topo de cada arquivo de `contexto/`. Sem a linha, considerar a data
do último commit que mexeu no arquivo.

## 2. O que aconteceu desde então

Levantar, a partir da data mais antiga:
- `diario/`: decisões, entregas e pendências que se repetem;
- `decisoes/`: arquivos novos ou substituídos;
- `entregas/` e `projetos/`: o que foi produzido (indica produtos, campanhas e públicos novos);
- `git log --since=<data>` no workspace;
- correções que o usuário fez na conversa e não foram guardadas.

## 3. Comparar

Para cada arquivo, procurar:

| Arquivo | Sinais de que está velho |
|---|---|
| `negocio.md` | Produto, preço, pessoa ou ferramenta que mudou; número de "Números que importam" com mais de 3 meses |
| `voz.md` | Correções de tom repetidas que não estão lá |
| `foco.md` | Prazo que passou; prioridade que já foi entregue; trabalho real diferente do foco escrito |
| `glossario.md` | Termos usados no diário e nas decisões que não estão lá |
| `marca/` | Peças aprovadas usando cor, fonte ou medida que não está no guia |
| `CLAUDE.md` | Seção "Este negócio" desatualizada; skills na pasta que não estão na tabela |

Também procurar **contradições**: o mesmo assunto dito de dois jeitos em arquivos diferentes.

## 4. Propor

Mostrar a lista de mudanças, agrupada por arquivo, cada uma com a origem:

```
contexto/foco.md
- Trocar a prioridade 1 "Lançar o plano anual" (entregue em 12/10, diário) por "…" (perguntar)
- Prazo 30/09 passou: qual o novo?
contexto/glossario.md
+ "Reativação": cliente sem compra há 6 meses que voltou (decisão de 03/10)
```

- O que tem fonte clara: propor o texto pronto.
- O que depende do usuário: perguntar, uma coisa por vez.
- Não mexer em nada antes do "ok". O usuário pode aprovar tudo ou item por item.

## 5. Aplicar

Fazer as mudanças aprovadas, atualizar a linha `> Revisado em: DD/MM/AAAA` no topo de cada arquivo
revisado e salvar pelo `/salvar` com a mensagem `Contexto revisado em DD/MM/AAAA`.

## Resposta

```
Contexto revisado · N mudanças em N arquivos
Em aberto: [o que o usuário ficou de responder]
Próxima revisão sugerida: DD/MM
```
