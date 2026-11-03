---
name: passagem
description: >
  Escreve ou atualiza o documento de passagem de um projeto, para outra pessoa (ou outra sessão do
  Claude) assumir sem depender de quem fez: o que é, como funciona, como rodar, em que pé está, o
  que foi decidido e o que falta. Use quando o usuário disser "passagem", "documenta para outra
  pessoa assumir", "vou sair de férias", "novo dev vai entrar", "onde paramos?", "/passagem".
---

# /passagem

Quem assume um projeto precisa de três respostas no primeiro dia: **o que é isso, como eu mexo e
o que está pela metade.** O documento de passagem responde as três sem a pessoa ter que perguntar.

## 1. Qual projeto e para quem

- O projeto: uma pasta de `projetos/`, um repositório de código ou o workspace inteiro.
- Quem vai assumir: alguém técnico (precisa de como rodar e da estrutura do código), alguém de
  negócio (precisa de processos, pessoas e acessos) ou uma nova sessão do Claude (precisa de
  estado e próximos passos). Ajustar as seções a isso.

## 2. Ler tudo antes de escrever

`CLAUDE.md` e `README.md` do projeto, specs, `andamento.md` e `tarefas.md`, `decisoes/`, os
últimos dias de `diario/`, `git log` recente e, em código, a estrutura de pastas, o arquivo de
dependências e as variáveis de ambiente esperadas.

## 3. Escrever `PASSAGEM.md` na raiz do projeto

```markdown
# Passagem — [Projeto]

> Atualizado em DD/MM/AAAA por [quem]. As seções acima de "Notas de quem passou" são
> regeneradas pelo /passagem; as notas são mantidas.

## O que é
[Em 3 a 5 linhas: o problema que resolve, para quem, situação atual.]

## Como funciona
[Visão geral: as partes e como se ligam. Em código: tecnologias e estrutura de pastas.]

## Como mexer
[Passo a passo para rodar ou operar: instalação, acessos necessários (sem senhas!), comandos.]

## Em que pé está
**Pronto:** …
**Em andamento:** … (onde parou, o que falta)
**Não começado:** …

## Decisões que importam
- DD/MM — [decisão] — [link]

## Cuidado com
[Armadilhas, partes frágeis, coisas que parecem erradas mas são de propósito.]

## Pendências conhecidas
- [ ] …

## Pessoas e acessos
| Quem | Papel | Para quê procurar |

## Notas de quem passou
[Texto livre de quem está passando o projeto. Nunca é apagado pelo /passagem.]
```

## 4. Atualizar sem perder

Se `PASSAGEM.md` já existe: regenerar as seções de cima a partir do estado atual e **manter
intacta** a seção "Notas de quem passou". Mostrar o que mudou desde a versão anterior.

## 5. Lacunas

Listar o que não deu para descobrir lendo (um acesso, o motivo de uma decisão, uma senha que
precisa ser passada por outro canal) e perguntar ao usuário. Nunca escrever senha, token ou chave
no documento.

## Resposta

```
Passagem: [caminho]/PASSAGEM.md · [criado · atualizado]
Lacunas: [o que falta o usuário completar · ou: nenhuma]
```
