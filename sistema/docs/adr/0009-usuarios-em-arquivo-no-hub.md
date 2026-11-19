# Usuários do hub em arquivo, com e-mail e senha

O hub passa a ter um login por pessoa. Os usuários ficam em `DATA_DIR/usuarios.json` (fora do workspace e do git), com senha em hash scrypt, papel `admin` ou `membro` e sessão em cookie JWT que carrega só o id. O proxy confere a cada requisição se o usuário segue ativo e se a sessão é posterior à última troca de senha. O primeiro administrador é criado na tela de login, protegido pela `HUB_PASSWORD` (que deixa de ser a senha do hub e vira chave de instalação). Administradores criam pessoas com senha provisória, que precisa ser trocada no primeiro acesso.

## Considered Options

- **Supabase Auth / Postgres** (previsto na ADR 0003): adiado. Para ~10 pessoas num único servidor, um arquivo resolve sem serviço externo, e a troca depois fica restrita a `src/lib/usuarios.ts`.
- **Login com Google:** descartado por agora; exige app no Google Cloud e não sabemos se a Stage usa Google Workspace.
- **Senha única compartilhada** (como era): não identifica quem fez o quê nem permite tirar o acesso de uma pessoa.

## Consequences

- Um único processo do hub grava o arquivo (fila em memória + escrita atômica). Mais de uma instância exigiria banco.
- Todos usam o mesmo workspace: o que uma pessoa produz aparece para todas na hora.
- Ainda não há registro de autoria nos arquivos do Social/Ads (quem criou cada Pauta); o id do usuário está disponível para isso.
