---
name: protecao-git
description: >
  Conferências obrigatórias antes de qualquer comando Git que envia, apaga, desfaz ou reescreve
  algo (push, reset, checkout de arquivo, rebase, apagar branch, limpar arquivos). Vale também
  dentro de outras skills, como /salvar e /encerrar. Use sempre antes desses comandos, e quando o
  usuário disser "descarta isso", "volta como estava", "força o envio", "apaga a branch".
---

# Proteção do Git

O Git guarda tudo, menos o que ainda não foi salvo e o que for apagado à força. Estas
conferências existem para nenhum trabalho se perder por um comando dado com pressa.

## Antes de enviar (push)

1. `git remote -v`: o remoto é o repositório **deste** workspace? Se apontar para outro (de onde
   o projeto foi copiado, de outro cliente), parar e avisar.
2. `git status`: nada de `_privado/`, `entrada/`, `.env`, senhas, tokens ou arquivos acima de
   20 MB indo junto.
3. A branch é a certa?
4. Push recusado por divergência: avisar e oferecer `git pull --rebase`. Conflito é mostrado ao
   usuário, nunca resolvido no escuro.

## Antes de desfazer ou apagar

Comandos: `reset --hard`, `checkout -- <arquivo>`, `restore`, `clean`, `branch -D`, `stash drop`,
`rebase`, `commit --amend` em commit já enviado.

1. Mostrar **exatamente** o que vai se perder (arquivos e um resumo das mudanças).
2. Dizer se dá para recuperar depois e como.
3. Oferecer a alternativa segura: guardar antes (`git stash`, uma branch de backup, uma cópia).
4. Só seguir com o "sim" explícito do usuário, dado depois de ver a lista.

## Nunca

- `push --force` ou `--force-with-lease` na branch principal.
- Reescrever histórico que já foi enviado.
- Mudar o autor de commits.
- `--no-verify` para pular verificações, a menos que o usuário peça e entenda o motivo.

## Na dúvida

Parar e perguntar. Um minuto de pergunta custa menos que uma tarde de trabalho perdido.
