#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
exec docker compose --env-file "${PRODUCTION_ENV_FILE:-.env.production}" -f compose.production.yaml "$@"
