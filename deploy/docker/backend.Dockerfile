# Node 22.23.2 Alpine 3.24; amd64 immutable base digest.
FROM node:22.23.2-alpine3.24@sha256:b64da1de5a51067ab8e75f0bc8dbd0905d8894baa22261f439a4572f41291e50 AS runtime

WORKDIR /app/geezle-backend

COPY geezle-backend/package*.json ./
RUN npm install --global npm@11.6.1 --no-audit --no-fund \
  && npm install --global tar@7.5.19 --no-audit --no-fund \
  && NPM_TAR_ROOT="$(npm root -g)/tar" \
  && test "$(NPM_TAR_ROOT="$NPM_TAR_ROOT" node -p 'require(process.env.NPM_TAR_ROOT+"/package.json").version')" = "7.5.19" \
  && rm -rf "$(npm root -g)/npm/node_modules/tar" \
  && mkdir -p "$(npm root -g)/npm/node_modules/tar" \
  && cp -a "$(npm root -g)/tar/." "$(npm root -g)/npm/node_modules/tar/" \
  && test "$(NPM_TAR_ROOT="$(npm root -g)/npm/node_modules/tar" node -p 'require(process.env.NPM_TAR_ROOT+"/package.json").version')" = "7.5.19" \
  && npm ci --include=dev \
  && npm cache clean --force

COPY geezle-backend/src ./src
COPY geezle-backend/prisma ./prisma
COPY geezle-backend/prisma.config.ts ./
COPY geezle-backend/scripts ./scripts
COPY geezle-backend/tsconfig*.json ./

RUN DATABASE_URL=postgresql://prisma-build:prisma-build@127.0.0.1:5432/prisma_build \
  SHADOW_DATABASE_URL=postgresql://prisma-build:prisma-build@127.0.0.1:5432/prisma_build_shadow \
  npm run prisma:generate
RUN npm run build:prod

RUN addgroup -S appgroup \
  && adduser -S -G appgroup appuser \
  && mkdir -p uploads \
  && chown appuser:appgroup uploads

ENV NODE_ENV=production

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# SECURITY: Production runtime must NOT run migrations on boot.
# Migrations are an explicit release step (see docs/DATABASE_MIGRATIONS.md).
# Concurrent Cloud Run scale-out previously failed when migrate ran at startup.
CMD ["node", "dist/server.js"]
