# marketing/social/ — Pautas e Posts

Cada pasta é uma **Pauta** (`AAAA-MM-DD-slug/`) com um `pauta.md` e uma subpasta por **Post** (`<canal>-<formato>/`).
O Stage Hub lê o frontmatter de `post.md` para montar o Quadro e o Calendário.

```
2026-10-14-adocao-de-ia/
  pauta.md
  instagram-carrossel/
    post.md        ← frontmatter (canal, formato, serie, status, data_planejada, origem_arte) + Roteiro
    legenda.md
    arte/          ← PNGs/PDF da Arte
```

Valores aceitos:
- `canal`: instagram | linkedin
- `formato`: carrossel | post-unico | story (LinkedIn não tem story)
- `serie`: cultura-em-acao | dado | na-midia | socios | evento | conteudo
- `status`: rascunho | aprovado | em-design | pronto | publicado
- `origem_arte`: ia | designer (vazio até existir Arte)

Pautas com `exemplo: true` no `pauta.md` são de demonstração e podem ser apagadas.
