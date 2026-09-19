# Node 20.19.5 Bookworm slim; amd64 immutable builder/runtime base digest.
FROM node:20.19.5-bookworm-slim@sha256:d08621e478133b0492bd661ceee5d13a22b8c55297f3dbbb57f1c15d0c214942 AS builder
WORKDIR /app/geezle-backend
COPY geezle-backend/package*.json ./
RUN npm ci --include=dev && npm cache clean --force
COPY geezle-backend/src ./src
COPY geezle-backend/prisma ./prisma
COPY geezle-backend/prisma.config.ts ./
COPY geezle-backend/scripts ./scripts
COPY geezle-backend/tsconfig*.json ./
RUN npm run prisma:generate
RUN npm run build:prod
RUN find dist -type f -name '*.map' -delete

FROM node:20.19.5-bookworm-slim@sha256:d08621e478133b0492bd661ceee5d13a22b8c55297f3dbbb57f1c15d0c214942 AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/geezle-backend
COPY geezle-backend/package*.json ./
RUN npm ci --omit=dev \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm \
    node_modules/prisma node_modules/@prisma/dev node_modules/@prisma/config \
    node_modules/@prisma/studio-core node_modules/@visx node_modules/mysql2 \
    node_modules/deepmerge-ts node_modules/typescript
COPY --from=builder /app/geezle-backend/dist ./dist
COPY --from=builder /app/geezle-backend/node_modules/.prisma ./node_modules/.prisma
RUN groupadd --system appgroup \
  && useradd --system --gid appgroup --create-home appuser \
  && mkdir -p uploads \
  && chown appuser:appgroup uploads
ENV NODE_ENV=production
ENV MEDIA_WORKER_SERVICE=true
ENV MEDIA_PROCESSING_MODE=disabled
ENV MEDIA_VIDEO_PROCESSING_ENABLED=false
ENV MEDIA_IMAGE_PROCESSING_ENABLED=false
ENV PORT=8080
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/mediaWorker.server.js"]
