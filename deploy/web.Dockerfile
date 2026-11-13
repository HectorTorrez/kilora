FROM node:24-alpine AS build
WORKDIR /app
RUN npm install --global pnpm@11.23.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages/contracts packages/contracts
ARG VITE_SITE_URL
ENV VITE_SITE_URL=$VITE_SITE_URL VITE_API_URL=""
RUN pnpm build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.output ./
USER node
EXPOSE 3000
CMD ["node", "server/index.mjs"]
