# Stage Hub SaaS Multi-Tenant: Next.js 16 + Prisma + Playwright Chromium (render de slides & extrator de design)
# A versão da imagem do Playwright precisa ser a mesma do pacote "playwright" do package.json.
FROM mcr.microsoft.com/playwright:v1.64.0-noble

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# Pastas de fallback local e cache já nascem do usuário sem privilégios (pwuser, uid 1000)
RUN mkdir -p /data /workspace /app/.blob-local \
  && chown -R pwuser:pwuser /app /data /workspace

ENV NODE_ENV=production \
  PORT=3100 \
  DATA_DIR=/data \
  WORKSPACE_DIR=/workspace

USER pwuser
EXPOSE 3100

# Suporta tanto o serviço Web ("npm start") quanto o Worker ("npm run worker") no Azure Container Apps
CMD ["npm", "start"]
