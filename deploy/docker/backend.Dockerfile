FROM node:20-alpine AS runtime

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

EXPOSE 5000

# Ensure DB schema is up-to-date in production before booting the server.
# Safe for additive migrations; Prisma uses locking to avoid concurrent apply.
CMD ["sh", "-c", "npm run migrate:apply && node -r ts-node/register/transpile-only src/server.ts"]
