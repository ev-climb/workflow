FROM node:22-alpine AS base
ENV CI=1 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY . .
# сборка импортирует модуль клиента базы, а тот падает без DATABASE_URL; соединения на
# этом этапе никто не открывает, так что заглушки хватает — настоящий адрес приходит
# из окружения контейнера
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/build
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 MIGRATIONS_DIR=/app/migrations
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/src/server/db/migrations ./migrations
COPY --from=build /app/scripts/migrate.ts ./scripts/
# сборка standalone тащит только то, что нужно приложению; мигратор туда не попадает
COPY --from=deps /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=deps /app/node_modules/postgres ./node_modules/postgres
# в корне standalone может оказаться package.json с commonjs — миграции запускаются как ESM
RUN printf '{"type":"module"}' > ./scripts/package.json && mkdir -p /app/attachments && chown node /app/attachments
USER node
EXPOSE 3000
CMD ["node", "server.js"]
