# ─── Unified Full-Stack Dockerfile (for Northflank / Container Deployments) ───
# Builds both Next.js Frontend and FastAPI Backend into a single high-efficiency container.

# ─── Stage 1: Build Next.js Web Frontend ───────────────────────────────────────
FROM node:20-alpine AS web-builder
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json* ./
RUN npm ci
COPY apps/web .
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 2: Install Python Dependencies ──────────────────────────────────────
FROM python:3.11-slim AS api-builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libmagic1 \
    curl \
    && rm -rf /var/lib/apt/lists/*
COPY apps/api/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ─── Stage 3: Unified Production Runner ────────────────────────────────────────
FROM python:3.11-slim AS runner
WORKDIR /app

# Install system runtime dependencies and Node.js 20
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libmagic1 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages and binaries
COPY --from=api-builder /install /usr/local

# Copy FastAPI backend code
COPY apps/api /app/backend

# Copy Next.js standalone build & static assets
COPY --from=web-builder /app/.next/standalone /app/frontend
COPY --from=web-builder /app/.next/static /app/frontend/.next/static
COPY --from=web-builder /app/public /app/frontend/public

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Environment Defaults
ENV ENVIRONMENT=production
ENV DEBUG=false
ENV PORT=3000
ENV INTERNAL_API_URL=http://127.0.0.1:8000
ENV STORAGE_PROVIDER=local

EXPOSE 3000

CMD ["/app/entrypoint.sh"]
