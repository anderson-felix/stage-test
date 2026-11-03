# Deploy — Stage Hub na VPS

Como colocar o hub no ar para o time. Decisões em [ADR 0003](adr/0003-stack-nextjs-vps.md) (VPS + Docker) e [ADR 0009](adr/0009-usuarios-em-arquivo-no-hub.md) (logins).

## O que sobe

| Peça | O que faz |
|---|---|
| `hub` (Dockerfile) | Next.js + Chromium (render da Arte) + Claude Code. Usuário sem privilégios (`pwuser`) |
| `caddy` | Recebe o tráfego (80/443) e emite o HTTPS sozinho (Let's Encrypt) |
| `./workspace` | Clone do TatuOS: memória, identidade, skills e tudo o que o time produz |
| volume `hub-data` | Usuários do hub (`usuarios.json`) |
| volume `claude-home` | Sessões do Claude Code (continuar conversas do chat) |

## Antes de começar

- **VPS:** Ubuntu 24.04, mínimo **2 vCPU e 4 GB de RAM** (o Chromium do render e o Claude Code rodam juntos), 40 GB de disco. Provedores: Hostinger, DigitalOcean, Hetzner, Contabo.
- **Chave de API da Anthropic** (console.anthropic.com), da conta da Stage. Sem ela o Claude não roda no servidor. *Status: aguardando aprovação.*
- **Acesso de leitura aos dois repositórios** no GitHub (`tatucotech/stage-hub` e `tatucotech/stage-mkt`), e de escrita no TatuOS para o backup. Use uma *deploy key* por repositório (passo 3).

## Passo a passo

### 1. Endereço

Sem DNS da Stage, o endereço é o IP da VPS no serviço gratuito sslip.io: IP `203.0.113.10` → `203-0-113-10.sslip.io`. O HTTPS funciona normalmente. Quando houver domínio (ex.: `hub.stage.consulting`), é só apontar para o IP e trocar `HUB_HOST`.

### 2. Docker na VPS

```bash
ssh root@IP-DA-VPS
curl -fsSL https://get.docker.com | sh
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
```

### 3. Código e workspace

```bash
# chaves de acesso ao GitHub (cadastre cada .pub como Deploy key no repositório certo;
# a do TatuOS com "Allow write access" para o backup)
ssh-keygen -t ed25519 -f ~/.ssh/hub -N ""
ssh-keygen -t ed25519 -f ~/.ssh/tatuos -N ""
cat >> ~/.ssh/config <<'EOF'
Host github-hub
  HostName github.com
  IdentityFile ~/.ssh/hub
Host github-tatuos
  HostName github.com
  IdentityFile ~/.ssh/tatuos
EOF

mkdir -p /srv && cd /srv
git clone git@github-hub:tatucotech/stage-hub.git
cd stage-hub
git clone git@github-tatuos:tatucotech/stage-mkt.git workspace
chown -R 1000:1000 workspace     # o hub roda como uid 1000 e precisa gravar no workspace
```

### 4. Configuração (`/srv/stage-hub/.env`)

```bash
cp .env.example .env
nano .env
```

| Variável | Valor |
|---|---|
| `HUB_PASSWORD` | Chave de instalação (só para criar o primeiro administrador) |
| `HUB_SECRET` | `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | Chave da Stage |
| `HUB_HOST` | `203-0-113-10.sslip.io` |
| `SITE_URL` | `https://stage.consulting` |

Apague a linha `WORKSPACE_DIR` do `.env` (no servidor ela vem do `docker-compose.yml`).

### 5. Subir

```bash
docker compose up -d --build
docker compose logs -f hub        # Ctrl+C para sair
```

A primeira build leva alguns minutos. Depois, abra `https://<HUB_HOST>`.

### 6. Primeiro acesso

A tela de login pede a **chave de instalação** (`HUB_PASSWORD`) e cria o administrador. Em seguida: menu da pessoa (canto superior direito) → **Usuários** → **Novo usuário**. O hub mostra uma senha provisória para enviar à pessoa; no primeiro acesso ela troca.

## Dia a dia

**Atualizar o hub** (depois de um push no `stage-hub`):

```bash
cd /srv/stage-hub && git pull && docker compose up -d --build
```

**Backup do workspace no GitHub** (tudo que o time produz). Uma vez por dia, via cron:

```bash
crontab -e
# 0 23 * * * cd /srv/stage-hub/workspace && git add -A && git commit -qm "Backup automático do hub" && git push -q
```

> Depois que o hub estiver no ar, **o workspace do servidor passa a ser a fonte da verdade**. Quem mexer no TatuOS pelo computador deve dar `git pull` antes e `git push` depois, para não divergir.

**Backup dos usuários:** `docker compose cp hub:/data/usuarios.json ./usuarios-backup.json`.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Gerações falham com erro de autenticação | `ANTHROPIC_API_KEY` ausente ou sem crédito |
| HTTPS não sai | Portas 80/443 fechadas ou `HUB_HOST` com IP errado |
| "EACCES" ao gerar | Workspace sem `chown -R 1000:1000` |
| Render da Arte falha | Versão do Playwright no `Dockerfile` diferente da do `package.json` |
