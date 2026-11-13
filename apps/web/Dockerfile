# Contexto de build: raíz del repo (workspace de pnpm).
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter web...
COPY apps/web apps/web
COPY packages/contracts packages/contracts
# Variables públicas: se incrustan en el bundle en tiempo de build.
ARG VITE_SITE_URL=https://kilora.dev
ARG VITE_API_URL=
ENV VITE_SITE_URL=$VITE_SITE_URL VITE_API_URL=$VITE_API_URL
RUN pnpm --filter web build

FROM node:24-alpine
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 TZ=America/El_Salvador
WORKDIR /app
COPY --from=build --chown=node:node /src/apps/web/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
