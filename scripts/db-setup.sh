#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker no está instalado. Descárgalo en https://www.docker.com/products/docker-desktop" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "El daemon de Docker no responde. Abre Docker Desktop y vuelve a intentarlo." >&2
  exit 1
fi

docker compose up -d --wait db
./scripts/migrate.sh up
