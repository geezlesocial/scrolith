FROM node:20-alpine AS build

WORKDIR /workspace/geezle

COPY geezle/package*.json ./
RUN npm ci

COPY geezle/ ./

ARG VITE_API_URL=https://api.example.com/api
ARG VITE_BACKEND_URL=https://api.example.com
ARG VITE_PUBLIC_APP_DOMAIN=example.com

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}
ENV VITE_PUBLIC_APP_DOMAIN=${VITE_PUBLIC_APP_DOMAIN}

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY deploy/nginx/frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/geezle/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
