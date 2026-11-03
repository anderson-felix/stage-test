# Arte gerada pela IA no MVP, montada em HTML com a Biblioteca de assets

Substitui a ADR 0006. A Arte gerada pela IA é o diferencial do módulo e entra no MVP: ao aprovar o Roteiro, a skill `/carrossel` escreve o HTML da Arte usando a Série do Post e a Biblioteca de assets; o servidor do hub renderiza PNG (Instagram) e PDF (carrossel do LinkedIn) com Playwright. O designer vira opcional.

## Considered Options

- **Canva (brand templates + Autofill):** descartado; o designer da Stage trabalha no Figma e o Autofill exige Canva Enterprise.
- **Figma como motor de render:** descartado; a API do Figma lê e exporta, mas não preenche templates. O Figma vira a fonte da Biblioteca de assets.
- **Render pelo Claude (Bash):** descartado; o chat do hub não tem terminal (ADR 0001). Quem renderiza é o servidor do hub.

## Consequences

- O hub passa a depender do Playwright + Chromium (entra na imagem Docker da VPS).
- Elementos gráficos ricos (renders 3D, ilustrações) não são gerados: vêm da Biblioteca de assets. Sem fotos geradas por IA no MVP.
- Ajustes da Arte são pedidos pelo chat e re-renderizados; editor visual fica para a fase 2.
