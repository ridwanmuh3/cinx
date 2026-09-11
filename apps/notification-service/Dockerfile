# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/ packages/
COPY apps/ apps/

RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@ticketing/notification-service...

FROM build AS prod
RUN pnpm --filter @ticketing/notification-service deploy --legacy --prod /prod

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod /prod .
COPY --from=build /app/apps/notification-service/dist ./dist
USER node
EXPOSE 3004
CMD ["node", "dist/main.js"]
