# syntax=docker/dockerfile:1
FROM node:24.19.0-bookworm-slim@sha256:e5a8dee7bc1e6a215d224a7ef8206f7e77271bc3cabd5febf2beafac0674f174 AS development
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci
COPY --chown=node:node . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]

FROM development AS build
RUN VITE_USE_MOCK=0 npm run build

FROM nginx/nginx-unprivileged:stable-alpine@sha256:c3fc8fa482be50ef709c6438eb1bc98d50dbfe5a9b48be90711b8814f4dfd701 AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY --chown=101:101 nginx/default.conf.template /etc/nginx/templates/default.conf.template
ENV API_PROXY_TARGET=http://api:8080 \
    NGINX_ENVSUBST_FILTER=API_PROXY_TARGET
EXPOSE 8080
