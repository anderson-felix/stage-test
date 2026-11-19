# Stage Hub · AI First

**Hub de planejamento, criação e publicação das ações de marketing da Stage Consulting.**

Uma plataforma em que o time de marketing e a inteligência artificial trabalham juntos em todo o
ciclo do conteúdo: pauta, criação, aprovação e publicação nas redes, no site e nas campanhas.

A IA opera sobre uma **base de conhecimento** própria do marketing da Stage, que reúne o negócio,
a voz, a marca e o histórico de conteúdo. Por isso, cada post, página e anúncio já nasce no tom e
na identidade da Stage.

## O que a plataforma faz

- **Social:** pautas, calendário editorial e arte dos posts do Instagram e do LinkedIn criada com IA.
- **Site e landing pages:** páginas geradas e ajustadas com IA, com formulário de captação de leads.
- **Campanhas:** roteiros de vídeo e campanhas de anúncios prontas para o Google Ads.
- **Assistente de IA:** conversa com a IA dentro do hub, com acesso à base de conhecimento do
  marketing.

## Como usar no seu Claude

1. **Aceite o convite** deste repositório, que chega por e-mail.
2. **Abra o app do Claude para desktop**, vá na aba *Code* e escolha uma pasta do seu computador
   (ex.: Documentos).
3. **Cole este pedido:**

   ```
   Clone o repositório https://github.com/Stage-System/stage nesta pasta.
   Se eu ainda não estiver conectado ao GitHub, me ajude a fazer o login.
   ```

4. **Pronto.** Daqui para a frente, abra a aba *Code* escolhendo a pasta `stage/cerebro`. O Claude já
   carrega o contexto, a marca e as skills, sem nada para configurar.

Quem usa o VS Code ou o terminal pode fazer o mesmo pedido por lá.

## Pastas

| Pasta | O que é |
|---|---|
| `sistema/` | Código do hub. Como rodar em `sistema/README.md` e servidor em `sistema/docs/DEPLOY.md` |
| `cerebro/` | A base de conhecimento: contexto, marca, marketing e skills |

Sem chaves de acesso: as variáveis de ambiente ficam fora do repositório (modelo em
`sistema/.env.example`). Autoria e uso em [AUTORIA.md](AUTORIA.md).
