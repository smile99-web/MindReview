FROM node:22-alpine AS base

# === deps: install all dependencies ===
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
ENV npm_config_audit=false
ENV npm_config_fund=false
ENV npm_config_registry=$NPM_REGISTRY
ENV npm_config_fetch_retries=5
ENV npm_config_fetch_retry_mintimeout=20000
ENV npm_config_fetch_retry_maxtimeout=120000
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --prefer-offline
RUN node ./node_modules/prisma/build/index.js generate

# === builder: next build ===
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# === runner: production image ===
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install pg_isready for entrypoint health-check
RUN apk add --no-cache postgresql-client

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone Next.js output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy full node_modules so Prisma CLI can run migrations with its dependency tree.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

# Copy entrypoint
COPY scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
