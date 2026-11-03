# Workspace de marketing (TatuOS) separado do código do hub

O conteúdo de marketing (memória, identidade, skills, saídas) mora no repositório `tatucotech/Tatu-OS---Stage-MKT` e o código do hub em `stage-hub`. O hub aponta para o workspace via `WORKSPACE_DIR`. Separar permite que o time de marketing use o TatuOS direto no Claude Code, sem o hub, e que o hub evolua sem misturar commits de código com commits de conteúdo.
