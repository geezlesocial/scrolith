FROM node:20-alpine AS build

WORKDIR /app/geezle-backend

COPY geezle-backend/package*.json ./

RUN npm ci --include=dev \
  && npm cache clean --force

COPY geezle-backend/src ./src
COPY geezle-backend/prisma ./prisma
COPY geezle-backend/scripts ./scripts
COPY geezle-backend/tsconfig*.json ./

RUN npm run prisma:generate
RUN npm run build:prod

# Remove compilers, test frameworks, Prisma CLI, and every other
# development-only package before constructing the runtime image.
RUN npm prune --omit=dev \
  && npm cache clean --force

FROM node:20-alpine AS runtime

WORKDIR /app/geezle-backend

ENV NODE_ENV=production

COPY --from=build /app/geezle-backend/package.json ./package.json
COPY --from=build /app/geezle-backend/package-lock.json ./package-lock.json
COPY --from=build /app/geezle-backend/node_modules ./node_modules
COPY --from=build /app/geezle-backend/dist ./dist
COPY --from=build /app/geezle-backend/prisma ./prisma
COPY --from=build /app/geezle-backend/scripts ./scripts

EXPOSE 8080

CMD ["node", "dist/server.js"]