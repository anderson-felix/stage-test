---
name: mapear-rotinas
description: >
  Descobre as tarefas que se repetem no trabalho do usuário, escolhe as que mais valem a pena
  automatizar e transforma cada uma numa skill nova do TatuOS. Use quando o usuário disser
  "mapear rotinas", "o que dá para automatizar", "criar uma skill", "faço isso toda semana",
  "/mapear-rotinas".
---

# /mapear-rotinas

Uma skill vale a pena quando a tarefa se repete, segue mais ou menos o mesmo caminho e toma tempo.
Este fluxo encontra essas tarefas e escreve a skill de cada uma.

## 1. Levantar

Antes de perguntar, olhar o que já existe: `diario/` (tarefas que aparecem toda semana),
`entregas/` (arquivos parecidos com datas diferentes) e as skills de `.claude/skills/`.

Depois, conversar (uma pergunta por vez):
- "O que você faz toda semana que é parecido com a semana anterior?"
- "Qual tarefa você adia porque é chata, mas não pode deixar de fazer?"
- "O que você explica para alguém de novo toda vez?"

Para cada tarefa: com que frequência, quanto tempo leva, de onde vêm as informações e o que sai
no fim.

## 2. Priorizar

Mostrar em tabela, ordenada pela nota:

| Tarefa | Frequência | Tempo | Segue um padrão? | Nota |
|---|---|---|---|---|

- **Nota** = horas por mês × padrão (1 = cada vez é diferente, 2 = parecido, 3 = sempre igual).
- Tarefa que depende de julgamento do usuário a cada passo não vira skill inteira: vira skill que
  prepara o material para ele decidir.
- Se uma skill do TatuOS já faz aquilo, dizer qual e não criar outra.

O usuário escolhe por onde começar.

## 3. Desenhar a skill

Com o usuário, para a tarefa escolhida:
1. **Gatilho:** como ele vai pedir (as frases que ele usa de verdade).
2. **Entradas:** o que precisa estar à mão (arquivo em `entrada/`, informação da conversa,
   arquivo de `contexto/`).
3. **Passos:** o caminho de hoje, como ele faz, e onde ele costuma errar ou perder tempo.
4. **Saída:** o formato exato do resultado e onde salvar.
5. **Pontos de parada:** onde o Claude precisa do "ok" antes de seguir.

## 4. Escrever

Criar `.claude/skills/<nome>/SKILL.md` seguindo `como-escrever-skill.md` (nesta pasta).
Acrescentar a skill na tabela de skills do `CLAUDE.md`.

## 5. Testar

Rodar a skill nova com um caso real do usuário, na mesma conversa. Ajustar o que não saiu como
ele esperava. Só considerar pronta depois de um resultado aprovado.

## Resposta

```
Skill criada: /<nome> — [o que faz]
Economia estimada: Xh por mês
Próxima da lista: [tarefa] (nota N)
```
