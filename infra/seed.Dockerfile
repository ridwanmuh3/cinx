# syntax=docker/dockerfile:1

# One-shot image used to seed demo data (admin user + cinema catalog).
# It keeps devDependencies so the `tsx`-based seed scripts can run.
FROM node:22-alpine AS seed
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/ packages/
COPY apps/ apps/

RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@ticketing/user-service... --filter=@ticketing/cinema-service...

CMD ["sh", "-c", "pnpm --filter @ticketing/user-service seed:admin && pnpm --filter @ticketing/cinema-service seed"]
