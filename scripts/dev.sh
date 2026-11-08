#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose up -d --wait db

trap 'kill 0' EXIT INT TERM

pnpm api &
pnpm dev &

wait
