# Posts guardados como arquivos no workspace, sem banco de dados

Pautas e Posts do módulo Social são pastas e arquivos Markdown dentro do workspace TatuOS, não registros num banco. Assim o Claude e as skills leem e escrevem direto, o time pode trabalhar sem o hub e tudo fica versionado no GitHub. O banco (Supabase) entra só quando o hub virar multiusuário; aí migra o índice, não o conteúdo.
