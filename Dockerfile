# Tela Lucis: the API (Nest, run with tsx as in development) and the web app (Vite, built and
# served by nginx, which passes /api to the API). Build a target:
#   docker build --target api -t tela-lucis-api .
#   docker build --target web -t tela-lucis-web .
# or run everything, with Postgres and the migrations, with docker compose (docker-compose.yml).

ARG NODE_VERSION=22.17.1

# --- the API, its CLI commands and the migrations ---
FROM node:${NODE_VERSION}-slim AS api
WORKDIR /app

# all dependencies, dev ones too: the API runs its TypeScript with tsx, a dev dependency (so
# NODE_ENV is set only after installing)
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
ENV NODE_ENV=production NPM_CONFIG_UPDATE_NOTIFIER=false

COPY tsconfig.json types.ts migrate.ts api.yaml ./
COPY actions ./actions
COPY api ./api
COPY book_importers ./book_importers
COPY cli ./cli
COPY core ./core
COPY lib ./lib
COPY migrations ./migrations
COPY model ./model

USER node
EXPOSE 3000
CMD ["npx", "tsx", "api/main.ts"]

# --- building the web app ---
FROM node:${NODE_VERSION}-slim AS web-build
WORKDIR /app/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

# the web app imports ../lib/lib.ts (components/pager.ts)
COPY lib /app/lib
COPY web ./
RUN npx vite build

# --- the web app, served by nginx ---
FROM nginx:1.29-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/web/dist /usr/share/nginx/html
EXPOSE 80
