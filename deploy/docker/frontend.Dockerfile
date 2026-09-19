# Node 20.19.5 Alpine; amd64 immutable build-stage digest.
FROM node:20.19.5-alpine@sha256:be8d32d651b3e0c9c2b28fdc1d3888408125d703232013cff955344d052027e5 AS build

WORKDIR /workspace/geezle

COPY geezle/package*.json ./
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org
ENV CYPRESS_INSTALL_BINARY=0
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm install --global npm@11.6.1 --no-audit --no-fund \
  && npm install --global tar@7.5.19 --no-audit --no-fund \
  && rm -rf "$(npm root -g)/npm/node_modules/tar" \
  && ln -s "$(npm root -g)/tar" "$(npm root -g)/npm/node_modules/tar" \
  && npm ci --include=dev --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 || npm install --include=dev --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

COPY geezle/ ./

ARG VITE_API_URL=https://api.scrolith.com/api
ARG VITE_BACKEND_URL=https://api.scrolith.com
ARG VITE_PUBLIC_APP_DOMAIN=scrolith.com
ARG VITE_MESSAGES_TRACE_DEBUG=false
ARG VITE_INSTANT_GRAPH_ENABLED=false

RUN npm run build

# Nginx 1.29.1 Alpine; amd64 immutable runtime digest.
FROM nginx:1.29.1-alpine@sha256:60e48a050b6408d0c5dd59b98b6e36bf0937a0bbe99304e3e9c0e63b7563443a AS runtime

COPY deploy/nginx/frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/geezle/dist /usr/share/nginx/html

RUN mkdir -p /var/cache/nginx /var/log/nginx /var/lib/nginx /run \
  && chown -R nginx:nginx /var/cache/nginx /var/log/nginx /var/lib/nginx /run /usr/share/nginx/html

USER nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "--spider", "--quiet", "http://127.0.0.1:8080/"]

CMD ["nginx", "-g", "daemon off;"]
