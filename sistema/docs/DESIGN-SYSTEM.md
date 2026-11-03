# Design System — Stage Hub

Como a **interface do hub** é desenhada. A identidade das **peças de marketing** (Arte dos Posts) não fica aqui: está em `identidade/design-guide.md` no TatuOS.

## Princípios

- Tema escuro, com o roxo Stage como única cor de marca.
- Denso e funcional: é ferramenta de trabalho diário, não página de marketing.
- Português em toda a interface.

## Cores

Tokens CSS em `src/app/globals.css`, expostos ao Tailwind como `bg-*`, `text-*`, `border-*`.

| Token | Hex | Uso |
|---|---|---|
| `bg` | `#0b0a10` | Fundo da página |
| `surface` | `#13111b` | Cards, painéis |
| `surface-2` | `#1a1724` | Elementos sobre cards, hover |
| `border` | `#262236` | Bordas e divisores |
| `text` | `#ecebf2` | Texto principal |
| `muted` | `#8e8a9c` | Texto secundário |
| `brand` | `#4c0dff` | Roxo Stage: botões primários, aba ativa |
| `brand-hover` | `#5e24ff` | Hover do primário |
| `brand-soft` | `#a98bff` | Ícones e destaques sobre fundo escuro |
| `ok` | `#4ffbe5` | Sucesso, online (verde-água da marca) |
| `warn` | `#f5c451` | Atenção |
| `danger` | `#ff6b81` | Erro |

## Tipografia

- **Interface:** DM Sans (`--font-dm-sans`).
- **Código e caminhos:** JetBrains Mono (`--font-jb-mono`).

## Componentes

| Componente | Arquivo | Uso |
|---|---|---|
| `TopNav` | `src/components/TopNav.tsx` | Barra superior com as Abas |
| `Logo` | `src/components/Logo.tsx` | Logo oficial da Stage (`public/logo-stage.png`) |
| `ClaudeChat` | `src/components/ClaudeChat.tsx` | Chat com streaming, markdown e ferramentas usadas |
| `FileTree` | `src/components/FileTree.tsx` | Árvore do workspace |
| `ComingSoon` | `src/components/ComingSoon.tsx` | Placeholder de Aba futura |
| `SitePreview` | `src/components/SitePreview.tsx` | Site em iframe com barra de endereço, desktop/celular, recarregar |
| `Quadro` | `src/components/social/Quadro.tsx` | Colunas por Status com arrastar-e-soltar; card com capa da Arte |
| `NovaPauta` | `src/components/social/NovaPauta.tsx` | Modal com progresso da IA (padrão dos modais que chamam o Claude) |
| `PostDetalhe` | `src/components/social/PostDetalhe.tsx` | Roteiro em cartões de slide, lateral com Status, data, Legenda, exportar |
| `ProgressoIA` | `src/components/ProgressoIA.tsx` | Progresso de toda geração da IA: barra gradiente `brand → brand-soft`, etapas (check `ok`, atual com ponto pulsando `brand-soft`), status numa linha e tempo `mm:ss / ~estimativa`. Hook `useProgressoIA({ etapas, estimativaSeg })` |
| `SocialAbas` | `src/components/social/SocialAbas.tsx` | Alternância Quadro · Calendário · Instagram · LinkedIn no topo do Social, mais Analytics com selo "em breve" |
| `PerfilLinkedIn` | `src/components/social/PerfilLinkedIn.tsx` | Página da empresa como no LinkedIn: fundo `#f4f2ee`, capa em gradiente da marca, logo quadrado, botão azul `#0a66c2` "Abrir no LinkedIn", posts em cards brancos com selo do tipo (Carrossel PDF, Imagem, Vídeo, Texto) e curtidas |
| `PerfilInstagram` | `src/components/social/PerfilInstagram.tsx` | Perfil claro como no Instagram (avatar com anel gradiente da marca), grade 3 colunas 3:4 com o feed real; planejados com borda `brand-soft` e selo roxo; post aberto em iframe do Instagram na lateral |
| `ArtePainel` | `src/components/social/ArtePainel.tsx` | Mock de feed (Instagram/LinkedIn), miniaturas, Editar Arte, pedir ajuste, downloads, upload |
| `ArteEditor` | `src/components/social/ArteEditor.tsx` | Editor de Arte em três colunas (slides 88px · canvas escalado · propriedades 288px); seleção com borda `brand-soft` e alça de redimensionar, borda `ok` ao digitar; paleta da marca do design-guide do TatuOS |
| `NovaCampanha` / `CampanhaDetalhe` | `src/components/ads/` | Etapas numeradas, Grupos com preview do anúncio no Google e contagem de caracteres |
| `NovaLP` / `LPDetalhe` | `src/components/ads/` | Escolha da Finalidade em dois cartões ("Sim, campanha de Ads" / "Não, página do site"); preview da LP em iframe isolado, desktop/celular, quadro Finalidade com seletor segmentado, ajustes, download |
| Ícones | `lucide-react` | Todos os ícones |

### Padrões visuais

- Cards: `rounded-xl border border-border bg-surface`.
- Botão primário: `bg-brand hover:bg-brand-hover text-white rounded-lg`.
- Ícone de destaque: quadrado `bg-brand/15 text-brand-soft`.
- Selo de Status: `rounded-md px-2 py-0.5 text-[11px]`, cor por Status (ponto colorido no Social; `labels.ts` de cada módulo concentra rótulos e cores).
- Funcionalidade futura visível mas inativa: card com `opacity-75` e selo com cadeado explicando do que depende (ex.: "aguardando levantamento").
- Selo "em breve": `rounded bg-surface-2 px-1.5 py-0.5 text-[9–10px] font-semibold uppercase tracking-wider text-muted`, ao lado do nome da Aba no `TopNav` (Estúdio) ou do item em `SocialAbas` (Analytics). Uma Aba "em breve" abre uma página que descreve o que virá (`/estudio`).
- Operação longa da IA: bloco com spinner, lista de passos (`tool` do stream) e estimativa de tempo realista.
- Mocks de terceiros (feed do Instagram, resultado do Google) usam as cores da própria plataforma sobre fundo branco, para o preview ser fiel.
