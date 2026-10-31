#!/usr/bin/env bash
# Levanta todo el proyecto: base de datos, API y frontend.
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose up -d --wait db

trap 'kill 0' EXIT INT TERM

pnpm api &
pnpm dev &

wait
