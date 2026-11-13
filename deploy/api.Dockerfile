FROM golang:1.27.3-alpine AS build
WORKDIR /src/services/api
COPY services/api/go.mod services/api/go.sum ./
RUN go mod download
COPY services/api/ ./
RUN CGO_ENABLED=0 go build -trimpath -o /out/api ./cmd/api \
 && CGO_ENABLED=0 go build -trimpath -o /out/goose github.com/pressly/goose/v3/cmd/goose

FROM alpine:3.23
RUN apk add --no-cache ca-certificates tzdata
COPY --from=build /out/api /out/goose /usr/local/bin/
COPY db/migrations /migrations
USER 65532:65532
EXPOSE 8080
CMD ["api"]
