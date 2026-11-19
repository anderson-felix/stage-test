---
status: superseded by ADR-0007
---

# Módulo Social começa pelo roteiro para o designer, não pela arte gerada

O MVP do Social produz Roteiro e Legenda; a Arte é feita pelo designer da Stage e só volta ao hub para preview. Geração de arte pela IA (`/carrossel` + Playwright) e o editor visual ficam para uma fase 2. Motivo: a estratégia aponta o roteiro como a rotina a tirar das costas, a Stage já tem designer, e o render via Playwright não roda pelo chat do hub (terminal bloqueado, ADR 0001).

## Consequences

- Publicação é manual e o agendamento é só o calendário editorial, até existir conta Instagram Business.
- Métricas do perfil ficam fora do módulo até lá.
