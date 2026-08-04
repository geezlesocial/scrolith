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

# Remove development dependencies before constructing the runtime image.
# npm can retain peer-connected build tools after pruning, so explicitly
# remove the Prisma CLI and TypeScript compiler after client generation.
RUN npm prune --omit=dev \
  && rm -rf node_modules/prisma node_modules/typescript \
  && rm -f \
       node_modules/.bin/prisma \
       node_modules/.bin/tsc \
       node_modules/.bin/tsserver \
  && test ! -e node_modules/prisma \
  && test ! -e node_modules/typescript \
  && test ! -e node_modules/.bin/prisma \
  && test ! -e node_modules/.bin/tsc \
  && test ! -e node_modules/.bin/tsserver \
  && test -d node_modules/@prisma/client \
  && test -d node_modules/.prisma/client \
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