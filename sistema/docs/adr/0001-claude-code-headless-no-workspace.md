# Claude via Claude Code headless, rodando dentro do workspace TatuOS

O chat do hub dispara o Claude Code em modo headless (`claude -p --output-format stream-json`) com `cwd` no workspace Stage-Marketing (TatuOS), em vez de chamar a Messages API direto. Assim o Claude carrega `CLAUDE.md`, `_memoria/`, `identidade/` e as skills do workspace sem duplicar nada no hub. Usa o login local do Claude Code; antes de abrir para o time é obrigatório definir `ANTHROPIC_API_KEY`.

## Consequences

- Terminal (Bash) bloqueado no chat: o hub não executa comandos nem faz deploy.
- Conversas continuam com `--resume` usando o `session_id` salvo.
