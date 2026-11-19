---
titulo: Consultoria de IA para empresas
servico: technology
objetivo: formulario
orcamento_diario:
regiao: Brazil
lp_url:
status: rascunho
criada_em: 2026-10-07
---
## Briefing

Empresas médias e grandes que querem sair do piloto de IA e colocar casos de uso em produção com adoção real. Conversão: formulário de interesse.

## Estratégia

**Público.** Decisores de tecnologia, dados e operação em empresas médias e grandes (CIO, CTO, head de dados, diretoria de operações) que já testaram IA e não conseguiram escalar. A busca é de quem vai contratar, não de quem está estudando o tema.

**Campanha.** Uma campanha Search nacional (`Consultoria de IA para Empresas - Search`), Maximizar conversões, 4 grupos com 2 RSAs cada:

| Grupo | Tema de busca | Palavras | Exatas |
|---|---|---|---|
| Consultoria de IA | quem já busca contratar consultoria | 11 | consultoria de ia para empresas, consultoria de inteligência artificial para empresas, contratar consultoria de ia |
| IA Generativa e Agentes | LLM, agentes, IA generativa corporativa | 9 | consultoria de ia generativa |
| Implementação de IA | sair do piloto, escalar, integrar, automatizar processos | 12 | implementação de inteligência artificial em empresas, parceiro de implementação de ia |
| Estratégia e Governança de IA | roadmap, governança, estratégia | 5 | estratégia de ia para empresas |

**Por que esses grupos.** Cada um responde a um momento diferente do comprador: já quer consultoria; tem um tema técnico específico (generativa/agentes); tem piloto parado e precisa colocar em produção (o centro do briefing); ainda está desenhando a estratégia. A mensagem central dos anúncios é a do briefing: adoção real, do piloto à produção.

**Negativas por grupo.** "Consultoria de IA" bloqueia generativa, agentes, llm, governança e roadmap; "Implementação de IA" bloqueia generativa, agentes e llm. Assim cada busca cai no grupo com o anúncio mais aderente.

**O que ficou de fora.**
- `ia em produção` — ambíguo (atrai busca de IA na indústria/chão de fábrica).
- `casos de uso de ia para empresas`, `roi de inteligência artificial` — intenção informacional, melhor para SEO.
- `chatbot com ia para empresas`, `plataforma de ia corporativa` — atraem compradores de software pronto e PME.
- `mlops`, `machine learning para empresas` — busca técnica, de quem executa, não de quem contrata.

**Atenção: a pesquisa veio sem dados.** O `palavras-chave.csv` tem só os termos, sem volume, concorrência e lance (parece a lista de sementes, não o export do Planejador). A seleção foi feita só por especificidade com o serviço. Vale rodar os termos no Planejador de palavras-chave, reimportar e revisar antes de ativar: termos sem volume podem ficar como "baixo volume de pesquisa" e não veicular.

## Antes de ativar

- [ ] **Conversão do formulário** configurada no Google Tag Manager `GTM-5NDZ8J6` (evento de envio do formulário de interesse) e importada como ação de conversão principal no Google Ads. Sem isso, Maximizar conversões não tem o que otimizar.
- [ ] **LP no ar** com o formulário. `lp_url` está vazio: todos os anúncios apontam para `https://stage.consulting/` provisoriamente. Trocar o Final URL em `anuncios.csv` (8 linhas) pela URL da LP antes de importar.
- [ ] **Orçamento diário** definido. `orcamento_diario` está vazio, então a coluna Budget foi importada em branco; preencher no Editor ou no frontmatter.
- [ ] Revisar os 4 sitelinks (apontam para /products, /strategy, /experience e /about-us).
- [ ] Rodar os termos no Planejador de palavras-chave (ver "Atenção" acima).

## Como importar

1. Abrir o Google Ads Editor e baixar a conta (Conta > Baixar alterações recentes).
2. Importar nesta ordem, via **Conta > Importar > De arquivo**, um CSV por vez a partir de `ads-editor/`:
   1. `campanhas.csv`
   2. `grupos.csv`
   3. `keywords.csv`
   4. `keywords-negativas.csv`
   5. `anuncios.csv`
   6. `extensoes-sitelinks.csv`
3. Em cada importação, conferir o mapeamento de colunas na tela de revisão e clicar em **Processar** > **Concluir e revisar alterações** > **Manter**.
4. Preencher o orçamento diário na campanha e conferir idioma (Português) e local (Brasil).
5. Clicar em **Verificar alterações** e corrigir os avisos.
6. **Postar** as alterações. Tudo sobe pausado.
7. Com a checklist de "Antes de ativar" completa, ativar campanha e grupos na interface do Google Ads.
