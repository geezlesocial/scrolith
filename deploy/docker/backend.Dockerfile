FROM node:22.18-alpine AS runtime

WORKDIR /app/geezle-backend

COPY geezle-backend/package*.json ./
RUN npm ci --include=dev \
  && npm cache clean --force

COPY geezle-backend/src ./src
COPY geezle-backend/prisma ./prisma
COPY geezle-backend/prisma.config.ts ./
COPY geezle-backend/scripts ./scripts
COPY geezle-backend/tsconfig*.json ./

RUN npm run prisma:generate
RUN npm run build:prod

ENV NODE_ENV=production

EXPOSE 8080

# SECURITY: Production runtime must NOT run migrations on boot.
# Migrations are an explicit release step (see docs/DATABASE_MIGRATIONS.md).
# Concurrent Cloud Run scale-out previously failed when migrate ran at startup.
CMD ["node", "dist/server.js"]
