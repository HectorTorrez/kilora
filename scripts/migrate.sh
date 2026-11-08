#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

: "${DATABASE_URL:=postgres://kilora:kilora@localhost:5432/kilora?sslmode=disable}"

go tool goose -dir db/migrations postgres "$DATABASE_URL" "${@:-up}"
