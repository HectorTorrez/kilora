#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
backup_dir="${1:-backups}"
mkdir -p "$backup_dir"
backup_tmp="$(mktemp "$backup_dir/kilora-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
trap 'rm -f "$backup_tmp"' EXIT
./scripts/production/compose.sh exec -T db pg_dump -U kilora -d kilora --format=custom --no-owner --no-acl > "$backup_tmp"
./scripts/production/compose.sh exec -T db pg_restore --list < "$backup_tmp" > /dev/null
mv "$backup_tmp" "$backup_tmp.dump"
printf '%s\n' "$backup_tmp.dump"
