FROM node:20-alpine AS build

WORKDIR /workspace/geezle

COPY geezle/package*.json ./
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org
ENV CYPRESS_INSTALL_BINARY=0
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm ci --include=dev --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 || npm install --include=dev --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

COPY geezle/ ./

ARG VITE_API_URL=https://api.scrolith.com/api
ARG VITE_BACKEND_URL=https://api.scrolith.com
ARG VITE_PUBLIC_APP_DOMAIN=scrolith.com
ARG VITE_MESSAGES_TRACE_DEBUG=false

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY deploy/nginx/frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/geezle/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
