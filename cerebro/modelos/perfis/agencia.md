# Perfil: agência ou consultoria

Para quem atende clientes. O workspace pode ser de **um cliente** (recomendado quando o cliente é
grande) ou da **agência**, com um projeto por cliente.

## O que o /instalar pergunta a mais

- O workspace é de um cliente só ou de vários?
  - **Um cliente:** `contexto/` e `marca/` descrevem o cliente. A voz da agência (propostas,
    relatórios para o cliente) fica em `contexto/voz-agencia.md`.
  - **Vários:** `contexto/` descreve a agência; cada cliente vira um `/novo-projeto` com `marca/`
    e regras próprias.
- O que está no contrato: entregas, frequência, prazos de aprovação.
- Quem é o ponto focal no cliente e quem aprova lá dentro.
- Como o cliente recebe as entregas (e-mail, pasta compartilhada, reunião, ferramenta).

## Como fica a seção "Este negócio" do CLAUDE.md

```markdown
- **Negócio:** [Agência] atendendo [Cliente] — [o que a agência faz para ele]
- **Quem usa:** [nome], [papel]
- **Ponto focal no cliente:** [nome], [cargo] · aprova: [nome]
- **Foco do momento:** …

### Voz
- Peças para o público do cliente: `contexto/voz.md`
- Comunicação com o cliente (relatórios, e-mails, propostas): `contexto/voz-agencia.md`
```

## Ênfase

- Nunca misturar marca, dados ou regras de clientes diferentes. Na dúvida sobre de qual cliente é
  o pedido, perguntar.
- `/relatorio-ads` e `/analisar-dados` com a linguagem de quem presta contas ao cliente.
- `_privado/` guarda a margem, a negociação e o que não é para o cliente ver.
