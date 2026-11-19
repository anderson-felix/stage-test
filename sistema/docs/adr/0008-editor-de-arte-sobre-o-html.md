# Editor de Arte no hub, editando o próprio arte.html

A Arte gerada pela IA passa a ser editável à mão no hub (antes era fase 2). O Editor de Arte abre o `arte/arte.html` num iframe da mesma origem, sem scripts (CSP `script-src 'none'`), e o hub manipula o DOM: texto (duplo clique), posição (`translate` inline), tamanho, cor, fundo do slide, imagens da Biblioteca de assets ou enviadas, e slides (duplicar, mover, apagar). Salvar grava o HTML de volta e re-renderiza com o mesmo Playwright da [ADR 0007](0007-arte-gerada-pela-ia-no-mvp.md). O HTML continua sendo a única fonte da Arte, então o ajuste pela IA e o editor trabalham sobre o mesmo arquivo.

## Considered Options

- **Editor de canvas (Fabric/Konva) com modelo próprio da Arte (JSON):** descartado; exigiria converter o HTML da IA para outro formato e de volta, e a IA teria de aprender esse formato. Perderia gradientes, SVG inline e tipografia que o HTML já resolve.
- **Exportar para o Figma:** descartado agora; o designer edita no Figma, mas o usuário quer ajustar sem sair do hub. Pode voltar como exportação para peças especiais.
- **Só ajuste por texto (pedido à IA):** era o MVP; lento (1 a 3 minutos por ajuste) e impreciso para mudanças pequenas, como mover um título ou trocar uma cor.

## Consequences

- O `arte.html` passa a ter `style="..."` inline escrito pelo editor. A skill `/carrossel` (Modo Hub) preserva essas edições nos ajustes; "Gerar do zero" as descarta, com confirmação e cópia do HTML anterior em `arte/historico/`.
- O iframe precisa de caminhos que espelham o workspace (`/api/ws/...`) para os `../../identidade/...` relativos funcionarem igual ao render.
- Fotos enviadas no editor ficam em `<post>/arte/imagens/`.
- Edição só para Arte de origem IA (com `arte.html`); Arte do designer (PNG/PDF) continua sendo substituída por upload.
