FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org
ENV CYPRESS_INSTALL_BINARY=0
RUN npm ci --include=dev --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

COPY . .

ARG VITE_API_URL=https://api.scrolith.com/api
ARG VITE_API_BASE_URL=https://api.scrolith.com/api
ARG VITE_BACKEND_URL=https://api.scrolith.com
ARG VITE_PUBLIC_APP_DOMAIN=scrolith.com
ARG VITE_PUBLIC_APP_URL=https://scrolith.com
ARG VITE_MESSAGES_TRACE_DEBUG=false
ARG COMPAT_ASSET_ORIGIN=
ARG COMPAT_ASSET_ORIGINS=

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}
ENV VITE_PUBLIC_APP_DOMAIN=${VITE_PUBLIC_APP_DOMAIN}
ENV VITE_PUBLIC_APP_URL=${VITE_PUBLIC_APP_URL}
ENV VITE_MESSAGES_TRACE_DEBUG=${VITE_MESSAGES_TRACE_DEBUG}
ENV COMPAT_ASSET_ORIGIN=${COMPAT_ASSET_ORIGIN}
ENV COMPAT_ASSET_ORIGINS=${COMPAT_ASSET_ORIGINS}

# .env.production is copied with the source tree and otherwise overrides the
# Docker build arguments when Vite loads mode-specific environment files.
RUN if [ -f .env.production ]; then \
      sed -i "s|^VITE_API_URL=.*|VITE_API_URL=${VITE_API_URL}|" .env.production && \
      sed -i "s|^VITE_API_BASE_URL=.*|VITE_API_BASE_URL=${VITE_API_BASE_URL}|" .env.production && \
      sed -i "s|^VITE_BACKEND_URL=.*|VITE_BACKEND_URL=${VITE_BACKEND_URL}|" .env.production; \
    fi

RUN npm run build
RUN node scripts/prepare-compat-assets.mjs
RUN node scripts/compress-static-assets.mjs

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
