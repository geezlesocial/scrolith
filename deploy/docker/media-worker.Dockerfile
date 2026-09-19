# Phase 3B.4.2 — dedicated media worker image with ffmpeg + ffprobe.
# Separate from API (backend.Dockerfile) which intentionally has no media binaries.
#
# Build from monorepo root:
#   docker build -f deploy/docker/media-worker.Dockerfile -t scrolith-media-worker .
#
# Do not use this image for the public API service.

# Node 20.19.5 Bookworm slim; amd64 immutable base digest.
FROM node:20.19.5-bookworm-slim@sha256:d08621e478133b0492bd661ceee5d13a22b8c55297f3dbbb57f1c15d0c214942 AS runtime

# ffmpeg package provides both ffmpeg and ffprobe on Debian.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && ffmpeg -version \
  && ffprobe -version

WORKDIR /app/geezle-backend

COPY geezle-backend/package*.json ./
RUN npm install --global npm@11.6.1 --no-audit --no-fund \
  && npm ci --include=dev \
  && npm cache clean --force

COPY geezle-backend/src ./src
COPY geezle-backend/prisma ./prisma
COPY geezle-backend/scripts ./scripts
COPY geezle-backend/tsconfig*.json ./

RUN npm run prisma:generate

RUN groupadd --system appgroup \
  && useradd --system --gid appgroup --create-home appuser \
  && mkdir -p uploads \
  && chown appuser:appgroup uploads

ENV NODE_ENV=production
ENV MEDIA_WORKER_SERVICE=true
# Defaults remain safe: processing flags off until explicitly enabled per environment.
ENV MEDIA_PROCESSING_MODE=disabled
ENV MEDIA_VIDEO_PROCESSING_ENABLED=false
ENV MEDIA_IMAGE_PROCESSING_ENABLED=false

# Cloud Run default
ENV PORT=8080
USER appuser
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# No migrate:apply — API service owns schema migrations.
CMD ["node", "-r", "ts-node/register/transpile-only", "src/mediaWorker.server.ts"]
