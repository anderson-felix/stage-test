---
name: registrar-decisao
description: >
  Guarda uma decisão importante em decisoes/, com data, o que foi decidido, por quê, as
  alternativas descartadas e o que muda na prática, para que daqui a meses alguém saiba por que
  as coisas são como são. Use quando o usuário disser "registra essa decisão", "anota que
  decidimos", "por que mudamos isso mesmo?", "/registrar-decisao", ou logo depois de uma decisão
  que muda regra, processo, preço, público ou ferramenta.
---

# /registrar-decisao

A decisão em si cabe numa linha. O que se perde com o tempo é o **porquê** e o que foi
descartado. É isso que este registro guarda.

## Quando oferecer sem ser chamado

Logo depois de o usuário decidir algo que muda como o negócio opera. Uma linha: "Quer que eu
registre essa decisão?" Decisão pequena, de uma peça só, não precisa.

## 1. Os campos

Tirar da conversa o que já foi dito e perguntar só o que faltar, uma coisa por vez:
- **O que foi decidido**, em uma frase afirmativa.
- **Quem decidiu** (e quem foi consultado, se importar).
- **O contexto:** o problema ou a situação que pediu a decisão.
- **Alternativas** que foram consideradas e por que perderam.
- **O que muda na prática:** em que processo, arquivo, peça ou sistema.
- **Se substitui** uma decisão anterior (procurar em `decisoes/` por assunto parecido).

## 2. O arquivo

`decisoes/AAAA-MM-DD-assunto-curto.md`, no modelo do `decisoes/README.md`. Mostrar antes de
salvar.

Se substitui uma anterior:
- na nova, `Substitui: [arquivo antigo]`;
- na antiga, mudar a situação para `substituída por [arquivo novo]`. **Não apagar** a antiga.

## 3. O índice

Acrescentar uma linha na tabela "Índice" do `decisoes/README.md`:

```
| DD/MM/AAAA | [decisão em uma frase] | [quem] | [link] | valendo |
```

## 4. Reflexos

Listar o que precisa mudar por causa da decisão: `contexto/regras.md`, `contexto/foco.md`,
skills, modelos, projetos. Oferecer fazer os ajustes; não fazer sem o "ok".

## Resposta

```
Decisão registrada: decisoes/<arquivo>
[Substitui: <arquivo> · se houver]
Reflexos: [lista curta · ou: nenhum]
```
