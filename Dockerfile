FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org
ENV CYPRESS_INSTALL_BINARY=0
RUN npm ci --include=dev --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

COPY . .

ARG VITE_API_URL=https://api.scrolith.com/api
ARG VITE_BACKEND_URL=https://api.scrolith.com
ARG VITE_PUBLIC_APP_DOMAIN=scrolith.com
ARG VITE_PUBLIC_APP_URL=https://scrolith.com
ARG VITE_MESSAGES_TRACE_DEBUG=false
ARG VITE_SOCKET_URL=
ARG VITE_SOCKET_TRANSPORTS=polling,websocket

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}
ENV VITE_PUBLIC_APP_DOMAIN=${VITE_PUBLIC_APP_DOMAIN}
ENV VITE_PUBLIC_APP_URL=${VITE_PUBLIC_APP_URL}
ENV VITE_MESSAGES_TRACE_DEBUG=${VITE_MESSAGES_TRACE_DEBUG}
ENV VITE_SOCKET_URL=${VITE_SOCKET_URL}
ENV VITE_SOCKET_TRANSPORTS=${VITE_SOCKET_TRANSPORTS}

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
