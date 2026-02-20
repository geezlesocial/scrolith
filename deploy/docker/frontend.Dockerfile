FROM node:20-alpine AS build

WORKDIR /workspace/geezle

COPY geezle/package*.json ./
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org
ENV CYPRESS_INSTALL_BINARY=0
RUN npm ci --include=dev --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 || npm install --include=dev --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

COPY geezle/ ./

ARG VITE_API_URL=https://api.scrolith.com/api
ARG VITE_BACKEND_URL=https://api.scrolith.com
ARG VITE_PUBLIC_APP_DOMAIN=scrolith.com
ARG VITE_MESSAGES_TRACE_DEBUG=false

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}
ENV VITE_PUBLIC_APP_DOMAIN=${VITE_PUBLIC_APP_DOMAIN}
ENV VITE_MESSAGES_TRACE_DEBUG=${VITE_MESSAGES_TRACE_DEBUG}

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY deploy/nginx/frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/geezle/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
