---
name: segmentar-base
description: >
  Define quem deve receber uma campanha ou jornada de CRM (e-mail, WhatsApp, SMS, push): os
  filtros da base de clientes, as exclusões, o tamanho estimado e o grupo de controle, com o
  motivo de cada escolha, prontos para aplicar na ferramenta de CRM. Use quando o usuário disser
  "segmenta", "para quem mando", "monta a base da campanha", "quais filtros eu uso",
  "/segmentar-base".
---

# /segmentar-base

Mandar para todo mundo é o jeito mais rápido de cansar a base. A segmentação certa manda a
mensagem certa para quem tem motivo para responder, e deixa de fora quem não deveria receber.

## Antes: o mapa da base

A skill depende de `contexto/campos-da-base.md`, com os campos que a ferramenta de CRM permite
filtrar. Se o arquivo estiver vazio:
- pedir uma exportação da base (só os nomes das colunas e algumas linhas sem dado pessoal) ou um
  print da tela de filtros da ferramenta;
- montar o mapa com o usuário e salvar. Isso é feito uma vez só.

## 1. O objetivo

Uma pergunta por vez:
- **O que a campanha quer que a pessoa faça** (comprar, agendar, voltar, renovar, avaliar)?
- **Qual o tema ou a oferta?** Tem restrição de público (idade, região, produto que já tem)?
- **Canal** e se há limite de envios (custo por mensagem, cota da ferramenta).

## 2. Montar os filtros

Pensar em camadas e dizer o motivo de cada uma:

| Camada | Pergunta | Exemplos de campo |
|---|---|---|
| **Perfil** | Quem faz sentido receber? | idade, região, gênero (só se o tema exigir) |
| **Relação** | Em que momento a pessoa está com a marca? | recência da última compra, frequência, valor gasto, produto comprado |
| **Comportamento** | Mostrou interesse recente? | abriu, clicou, visitou, abandonou carrinho |
| **Canal** | Dá para falar com ela por este canal? | opt-in, número ou e-mail válido |

Regras:
- **Sempre excluir:** quem pediu para não receber, quem já converteu no objetivo da campanha,
  quem recebeu outra mensagem nos últimos dias (seguir o limite de `contexto/regras.md`; se não
  houver, sugerir um e oferecer o `/documentar-regra`).
- Dado sensível (saúde, finanças, religião, orientação) só se o tema exigir, a pessoa tiver
  consentido e a regra do negócio permitir. Na dúvida, apontar ao usuário.
- Termos como "cliente ativo" ou "inativo" seguem `contexto/glossario.md` e `contexto/regras.md`.

## 3. Tamanho e controle

- Se houver dados na `entrada/`, contar o tamanho de cada camada e o final. Se não, dizer o que
  conferir na ferramenta.
- Base pequena demais (menos de umas 500 pessoas) dificulta concluir qualquer coisa; grande demais
  para o objetivo, sugerir priorizar.
- **Grupo de controle:** sugerir separar de 5% a 10% sem receber, para medir o efeito real da
  campanha. Com base pequena, dizer que a medição vai ser fraca.

## 4. Entregar

```markdown
## Segmentação — [campanha] · DD/MM/AAAA

**Objetivo:** …
**Filtros:**
| Campo | Condição | Por quê |
**Exclusões:**
| Campo | Condição | Por quê |
**Tamanho:** ~N pessoas (de N na base) · controle: N%
**Conferir antes de enviar:** …
```

Salvar em `entregas/campanhas/<campanha>/segmentacao.md` ou na pasta do projeto.

## Resposta

```
Segmentação pronta · ~N pessoas · controle N%
Principais filtros: …
Exclusões: …
Arquivo: [caminho]
```
