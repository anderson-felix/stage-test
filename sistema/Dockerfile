# Stage Hub SaaS Multi-Tenant: Next.js 16 + Prisma + Playwright Chromium (render de slides & extrator de design)
FROM mcr.microsoft.com/playwright:v1.64.0-noble AS builder

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.64.0-noble AS runner

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    WORKSPACE_DIR=/workspace

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/messages ./messages
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Pastas de fallback local e cache do usuário sem privilégios (pwuser, uid 1000)
RUN mkdir -p /data /workspace /app/.blob-local \
  && chown -R pwuser:pwuser /app /data /workspace

USER pwuser
EXPOSE 3000

CMD ["npm", "start"]
