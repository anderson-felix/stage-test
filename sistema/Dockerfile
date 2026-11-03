# Stage Hub: Next.js + Chromium (render da Arte) + Claude Code headless.
# A versão da imagem do Playwright precisa ser a mesma do pacote "playwright" do package.json.
FROM mcr.microsoft.com/playwright:v1.64.0-noble

ENV NEXT_TELEMETRY_DISABLED=1

# Claude Code: o hub chama o binário `claude` (ADR 0001). No servidor ele usa ANTHROPIC_API_KEY.
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Pastas que viram volumes já nascem do usuário sem privilégios da imagem (pwuser, uid 1000).
RUN mkdir -p /data /workspace /home/pwuser/.claude \
  && chown -R pwuser:pwuser /app /data /workspace /home/pwuser

ENV NODE_ENV=production \
  PORT=3100 \
  CLAUDE_BIN=claude \
  DATA_DIR=/data \
  WORKSPACE_DIR=/workspace

USER pwuser
EXPOSE 3100
CMD ["npm", "start"]
