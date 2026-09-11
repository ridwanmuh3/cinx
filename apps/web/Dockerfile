# syntax=docker/dockerfile:1

# --- Stage 1: build the Vue app ---
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/web/tsconfig*.json apps/web/vite.config.ts apps/web/vitest.config.ts apps/web/
COPY apps/web/index.html apps/web/
COPY apps/web/src apps/web/src
COPY apps/web/public apps/web/public

RUN pnpm install --frozen-lockfile
RUN pnpm --filter web build

# --- Stage 2: nginx runtime ---
FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]