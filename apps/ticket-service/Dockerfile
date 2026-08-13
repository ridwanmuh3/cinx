# syntax=docker/dockerfile:1

# --- Stage 1: install + build all workspace deps for this app ---
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/ packages/
COPY apps/ apps/

RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@ticketing/ticket-service...

# --- Stage 2: keep only production deps (workspace deps bundled) ---
FROM build AS prod
RUN pnpm --filter @ticketing/ticket-service deploy --legacy --prod /prod

# --- Stage 3: runtime ---
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod /prod .
COPY --from=build /app/apps/ticket-service/dist ./dist
USER node
EXPOSE 3003
CMD ["node", "dist/main.js"]
