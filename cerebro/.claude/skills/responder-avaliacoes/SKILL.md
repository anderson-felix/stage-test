---
name: responder-avaliacoes
description: >
  Escreve respostas para avaliações de clientes (Google, Reclame Aqui, marketplaces, redes):
  agradece as boas sem repetir frase, trata as ruins com cuidado e leva o problema para o canal
  certo. Também aponta o que as avaliações dizem sobre o negócio. Use quando o usuário disser
  "responder avaliações", "avaliações do Google", "responde esse comentário", "reclamação",
  "/responder-avaliacoes".
---

# /responder-avaliacoes

Resposta de avaliação é lida por quem ainda vai escolher a empresa, não só por quem avaliou.
Cada uma mostra como o negócio trata as pessoas.

## 1. Juntar as avaliações

- Coladas na conversa, num print ou numa exportação em `entrada/`.
- Para cada uma: nome (como aparece), nota, data, texto, plataforma.
- Ler `contexto/voz.md` e `entregas/avaliacoes/respondidas.md` (se existir), para não repetir
  frases das últimas respostas.

## 2. Separar

| Tipo | Como reconhecer | Prioridade |
|---|---|---|
| **Crítica séria** | Acusação grave, risco à saúde ou à segurança, ameaça de processo, imprensa | 1 · não responder sem o usuário |
| **Negativa** | Nota 1 ou 2, ou problema concreto | 2 |
| **Neutra** | Nota 3, elogio com ressalva | 3 |
| **Positiva** | Nota 4 ou 5 | 4 |

As **críticas sérias** não ganham resposta automática: mostrar ao usuário, sugerir um rascunho e
dizer quem mais deveria ver antes (jurídico, gestor, responsável técnico).

## 3. Escrever

**Para todas:**
- Usar o primeiro nome da pessoa, se aparecer.
- Curta: 2 a 4 frases. Ninguém lê resposta longa.
- **Nunca expor dado pessoal** nem confirmar que a pessoa é cliente além do que ela mesma disse
  (em saúde, nem citar exame, consulta ou diagnóstico).
- Variar a abertura e o agradecimento. Nada de copiar e colar a mesma resposta.

**Positivas:** agradecer citando algo **concreto** que a pessoa escreveu ("que bom que o resultado
saiu antes do prazo"), e um convite leve para voltar.

**Neutras:** agradecer, reconhecer a ressalva sem justificar, dizer o que vai ser feito se houver
algo.

**Negativas:**
1. Reconhecer a experiência, sem discutir quem tem razão.
2. Pedir desculpas pelo que ela passou, uma vez só.
3. Levar para o canal privado: telefone, e-mail ou WhatsApp **do negócio** (pegar de
   `contexto/negocio.md`), com o nome do setor ou da pessoa que vai cuidar.
4. Sem desculpa genérica ("estamos sempre trabalhando para melhorar") e sem defesa pública.

## 4. Entregar

Tabela pronta para copiar:

| # | Cliente | Nota | Tipo | Resposta |
|---|---|---|---|---|

Acrescentar as respostas em `entregas/avaliacoes/respondidas.md` (data, plataforma, nota, primeira
frase da resposta), que serve de memória para variar as próximas.

## 5. O que as avaliações dizem

Com 5 avaliações ou mais no lote, fechar com até 3 linhas:
- o elogio que mais se repete (vale virar argumento de venda no `/copy-vendas`);
- a reclamação que mais se repete (vale levar para quem resolve);
- qualquer sinal novo, que não aparecia antes.
