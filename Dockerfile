# ============================================
# AD FUSION - Multi-stage Docker Build
# Node.js 20 + TypeScript → Production
# ============================================

# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY migrations/ ./migrations/

RUN npm run build

# --- Stage 2: Production ---
FROM node:20-alpine AS production

# Security: non-root user
RUN addgroup -S adfusion && adduser -S adfusion -G adfusion

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/migrations ./migrations

# Create logs directory
RUN mkdir -p /app/logs && chown -R adfusion:adfusion /app

USER adfusion

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/server.js"]
