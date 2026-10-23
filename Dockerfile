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

# ─── Stage 2: Unified Production Runner ────────────────────────────────────────
FROM python:3.11-slim AS runner
WORKDIR /app

# Install system runtime dependencies, build tools for C-extensions, and Node.js 20
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libmagic1 \
    build-essential \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Python backend dependencies natively
COPY apps/api/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

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

ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]
