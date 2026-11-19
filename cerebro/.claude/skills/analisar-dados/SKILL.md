---
name: analisar-dados
description: >
  Analisa uma planilha ou arquivo de dados (CSV, Excel, JSON, exportação de sistema) para
  responder uma pergunta de negócio: o que aconteceu, por quê e o que fazer. Confere a qualidade
  dos dados antes de concluir e entrega um resumo com números. Use quando o usuário disser
  "analisa essa planilha", "o que esses dados dizem", "olha esse relatório", "/analisar-dados".
---

# /analisar-dados

Análise começa pela pergunta, não pela planilha. Sem pergunta, qualquer gráfico parece
interessante e nenhum ajuda a decidir.

## 1. A pergunta

- Se o usuário só mandou o arquivo, perguntar: **"Que decisão esses dados vão ajudar a tomar?"**,
  e sugerir 2 ou 3 perguntas possíveis a partir das colunas.
- Fechar o período, o recorte (canal, região, produto) e a métrica que importa.

## 2. Conhecer os dados

Antes de qualquer conta, mostrar ao usuário em até 6 linhas:
- linhas e colunas, período coberto, o que é cada linha (um pedido? um cliente? um dia?);
- colunas que parecem importar para a pergunta e o que cada uma quer dizer (confirmar as
  ambíguas e registrar os termos em `contexto/glossario.md`, com o "sim" do usuário);
- **problemas:** vazios, duplicados, datas em formatos diferentes, valores impossíveis (idade
  negativa, venda de R$ 0), totais que não batem com o que o usuário conhece.

Se um problema muda a conclusão, parar e combinar com o usuário como tratar.

## 3. Calcular

- Fazer as contas **com código**, não de cabeça: o que o ambiente tiver (Node, Python, planilha).
  Salvar o script em `entregas/analises/<pasta>/` para dar para refazer com o próximo arquivo.
- Comparar sempre com algo: período anterior, média, meta, outro grupo. Número sozinho não diz se
  é bom.
- Olhar o total **e** a quebra: um total estável pode esconder uma parte que cresceu e outra que
  caiu.
- Diferença pequena com pouco volume não é tendência: dizer quando o número é baixo demais para
  concluir.

## 4. Explicar

Salvar `entregas/analises/AAAA-MM-DD-tema/analise.md`:

```markdown
# [Pergunta] — DD/MM/AAAA

## Resposta curta
[2 a 3 frases que respondem a pergunta, com os números principais]

## O que os dados mostram
- [achado com número e comparação]

## Por que provavelmente aconteceu
- [hipótese] — [o que nos dados sustenta · o que falta para confirmar]

## O que fazer
1. [ação concreta, com o número que justifica]

## Sobre os dados
[arquivo, período, linhas usadas, o que foi descartado e por quê]
```

- Separar o que os dados **mostram** do que é **hipótese**.
- Gráfico só quando ajudar mais que a tabela: um por ideia, com título que diga a conclusão
  ("Vendas no WhatsApp dobraram em outubro"), não o assunto ("Vendas por canal").

## Resposta

```
[Resposta curta em 2 frases]
Principais números: …
Ação sugerida: …
Análise: entregas/analises/<pasta>/analise.md
```
