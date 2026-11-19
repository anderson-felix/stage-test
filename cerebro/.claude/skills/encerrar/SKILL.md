---
name: encerrar
description: >
  Fecha o dia de trabalho: registra a hora de fim, escreve o diário (resumo, entregas, decisões,
  pendências e o que vale divulgar), atualiza a barra de progresso e salva no GitHub. Use quando o
  usuário disser "encerrar", "fechar o dia", "fim do expediente", "por hoje é só", "/encerrar".
---

# /encerrar

O dia só termina com o avanço anotado e salvo. O diário é escrito para ser relido por quem não
estava na conversa: linguagem de negócio, número concreto, sem jargão.

## 1. Hora e arquivo

- Hora local como no `/abrir`.
- Abrir `diario/AAAA-MM-DD.md`. Se não existir, criar com o início "não registrado".
- Se for fechamento atrasado (o dia já passou), usar a hora do último arquivo salvo ou commit
  daquele dia como fim e escrever "encerrado em DD/MM".

## 2. O que aconteceu

Nesta ordem:
1. A conversa do dia: o que ficou pronto, o que foi decidido, o que ficou pendente.
2. `git log --since="AAAA-MM-DD 00:00"` em cada repositório do projeto.
3. Arquivos alterados no dia em `entregas/`, `decisoes/` e `contexto/`.

Depois, **uma** pergunta só:
> "Teve algo fora daqui que vale registrar hoje? (reunião, conversa, decisão)"

## 3. O diário

Completar o arquivo do dia, sem apagar a linha de início:

```markdown
# Diário — DD/MM/AAAA

- **Início:** HH:MM · **Fim:** HH:MM · **Duração:** Xh YYmin
- **Progresso:** XX% (+N p.p. hoje) · faltam N sessões até DD/MM

## Resumo do dia
[2 a 4 frases: o avanço que mais importa e por quê]

## Entregas
- [o que ficou pronto, com número quando houver e link para o arquivo]

## Decisões
- [decisão] — [quem decidiu] · [link para decisoes/, se virou registro]

## Pendências e próximos passos
- [ ] [próximo passo] — [responsável]

## Vale divulgar
- [entrega contada para quem não é técnico]
```

- A linha de progresso só entra se existir `_privado/progresso.md`.
- **Resultado, não conversa.** Não copiar perguntas e respostas trocadas com o Claude.
- **Não inventar.** Sem decisão no dia: "Nenhuma".
- **Oficial × privado.** Ideias, planos não aprovados e assuntos pessoais vão para
  `_privado/pendencias.md`, nunca para o diário.
- **Sem dado pessoal de cliente.** Números agregados, sim.
- Decisão que muda como o negócio opera ganha também um arquivo em `decisoes/`.

## 4. Progresso

Se existir `_privado/progresso.md`:
1. Marcar o que foi entregue (pela metade conta metade do peso).
2. Item novo no escopo entra com peso, e o aumento vai na coluna "Escopo" do histórico.
3. Recalcular percentual, barra (20 blocos, 5% cada), sessões restantes e ritmo necessário.
4. Acrescentar a linha do dia no histórico.

## 5. Salvar

Seguir as conferências e as regras do `/salvar`. Commit com `Diário DD/MM/AAAA: [resumo curto]`.
Se houver outro repositório no projeto (código, por exemplo) com mudança não commitada, mostrar a
lista e perguntar antes: pode ser trabalho pela metade.

## Resposta (até 8 linhas)

```
Dia encerrado · HH:MM–HH:MM (Xh YYmin)
[o dia em uma frase]
Entregas: N · Decisões: N · Pendências: N
Progresso: XX% (+N p.p.) ██████████░░░░░░░░░░
Diário: diario/AAAA-MM-DD.md · Salvo: [hash]
Amanhã: [primeiro próximo passo]
```

Com progresso, dizer também se o dia ficou na meta: avanço do dia e média dos últimos 5 dias úteis
contra o ritmo necessário. Abaixo do ritmo: quanto falta recuperar por dia.
