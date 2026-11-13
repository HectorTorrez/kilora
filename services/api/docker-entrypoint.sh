#!/bin/sh
set -eu
# Aplica migraciones pendientes antes de arrancar el API.
if [ "${RUN_MIGRATIONS:-true}" = "true" ] && [ "${1:-}" = "api" ]; then
  goose -dir "${MIGRATIONS_DIR:-/app/db/migrations}" postgres "$DATABASE_URL" up
fi
if [ "${DEMO_MODE:-false}" = "true" ] && [ "${1:-}" = "api" ]; then
  seed
fi
exec "$@"
