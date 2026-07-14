# Phase 3B.4.2 — dedicated media worker image with ffmpeg + ffprobe.
# Separate from API (backend.Dockerfile) which intentionally has no media binaries.
#
# Build from monorepo root:
#   docker build -f deploy/docker/media-worker.Dockerfile -t scrolith-media-worker .
#
# Do not use this image for the public API service.

FROM node:20-bookworm-slim AS runtime

# ffmpeg package provides both ffmpeg and ffprobe on Debian.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && ffmpeg -version \
  && ffprobe -version

WORKDIR /app/geezle-backend

COPY geezle-backend/package*.json ./
RUN npm ci --include=dev \
  && npm cache clean --force

COPY geezle-backend/src ./src
COPY geezle-backend/prisma ./prisma
COPY geezle-backend/scripts ./scripts
COPY geezle-backend/tsconfig*.json ./

RUN npm run prisma:generate

ENV NODE_ENV=production
ENV MEDIA_WORKER_SERVICE=true
# Defaults remain safe: processing flags off until explicitly enabled per environment.
ENV MEDIA_PROCESSING_MODE=disabled
ENV MEDIA_VIDEO_PROCESSING_ENABLED=false
ENV MEDIA_IMAGE_PROCESSING_ENABLED=false

# Cloud Run default
ENV PORT=8080
EXPOSE 8080

# No migrate:apply — API service owns schema migrations.
CMD ["node", "-r", "ts-node/register/transpile-only", "src/mediaWorker.server.ts"]
