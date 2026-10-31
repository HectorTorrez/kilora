#!/usr/bin/env bash
# Ejecuta goose cargando las variables del .env de la raíz.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

: "${DATABASE_URL:=postgres://kilora:kilora@localhost:5432/kilora?sslmode=disable}"

if ! ls db/migrations/*.sql >/dev/null 2>&1; then
  echo "No hay migraciones todavía en db/migrations."
  exit 0
fi

go tool goose -dir db/migrations postgres "$DATABASE_URL" "${@:-up}"
