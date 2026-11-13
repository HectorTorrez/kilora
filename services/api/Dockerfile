# Contexto de build: raíz del repo (necesita go.work y db/migrations).
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.work go.work.sum ./
COPY services/api/go.mod services/api/go.sum services/api/
RUN cd services/api && go mod download
COPY services/api services/api
RUN cd services/api \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/seed ./cmd/seed \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/goose github.com/pressly/goose/v3/cmd/goose

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata wget && adduser -D -u 10001 app
ENV TZ=America/El_Salvador API_ADDR=:8080 APP_ENV=production
WORKDIR /app
COPY --from=build /out/ /usr/local/bin/
COPY db/migrations ./db/migrations
COPY --chmod=755 services/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
USER app
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["api"]
