---
name: novo-projeto
description: >
  Abre um projeto novo dentro do workspace (um cliente, uma campanha grande, um lançamento) com
  pasta própria, instruções próprias para o Claude e o acompanhamento de entregas e prazo. Use
  quando o usuário disser "novo projeto", "novo cliente", "começar um projeto", "abrir pasta para",
  "/novo-projeto".
---

# /novo-projeto

Projeto é trabalho com começo, meio e fim, e regras que só valem para ele. Ganha pasta própria
para que o contexto dele não se misture com o resto do negócio.

## 1. Entrevista curta

Uma pergunta por vez, com sugestão quando der:
1. **Nome** do projeto (vira o nome da pasta).
2. **Objetivo** em uma frase, com número se houver: "Lançar o plano anual e vender 200 até março".
3. **Para quem:** cliente externo, área interna ou o próprio negócio.
4. **Entregas** previstas e a data de cada uma.
5. **Pessoas:** quem decide, quem aprova, quem executa.
6. **O que é diferente** do resto do negócio: outro público, outro tom, outra marca, regras
   específicas.

## 2. Criar a pasta

`projetos/<nome-do-projeto>/` com:

**`CLAUDE.md`** (o Claude lê quando trabalha dentro da pasta):
```markdown
# Projeto: [Nome]

- **Objetivo:** …
- **Para quem:** …
- **Prazo final:** DD/MM/AAAA
- **Decide:** … · **Aprova:** …

## O que muda em relação ao resto do workspace
[tom, público, marca, regras próprias — ou "Nada: segue o contexto geral"]

## Onde está cada coisa
- `briefing.md` — o pedido original e o que foi combinado
- `entregas/` — o que for produzido
- `andamento.md` — entregas, status e decisões do projeto
```

**`briefing.md`**: tudo o que o usuário contou, organizado, e os documentos que ele mandar (o
original fica em `entrada/`, o resumo aqui).

**`andamento.md`**:
```markdown
# Andamento — [Nome]

| Entrega | Data | Responsável | Status |
|---|---|---|---|

## Decisões
- DD/MM — [decisão] — [quem]
```

**`entregas/`** vazia.

Se o projeto é de um cliente com marca própria, criar também `marca/` dentro do projeto e
preencher como no `/instalar` (só o bloco da marca).

## 3. Ligar ao resto

- Acrescentar o projeto em `contexto/foco.md`, na lista de prioridades, se ele for prioridade.
- Se houver `_privado/progresso.md`, perguntar se as entregas do projeto entram na barra de
  progresso e com que peso.

## Resposta

```
Projeto criado: projetos/<nome>/
Objetivo: …
Primeira entrega: [entrega] até DD/MM
Para trabalhar nele, é só citar o projeto ou abrir arquivos da pasta.
```
