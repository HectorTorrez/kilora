#!/bin/sh
set -eu
# Aplica migraciones pendientes antes de arrancar el API.
if [ "${RUN_MIGRATIONS:-true}" = "true" ] && [ "${1:-}" = "api" ]; then
  goose -dir /app/db/migrations postgres "$DATABASE_URL" up
fi
exec "$@"
