FROM node:20-alpine AS runtime

WORKDIR /app/geezle-backend

ENV NODE_ENV=production

COPY geezle-backend/package*.json ./
RUN npm ci

COPY geezle-backend/ ./

RUN npm run prisma:generate

EXPOSE 5000

CMD ["node", "-r", "ts-node/register/transpile-only", "src/server.ts"]
