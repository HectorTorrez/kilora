#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${1:?Usage: verify-backup.sh backup.dump}"
backup_file="$1"
test -r "$backup_file"
verify_db="kilora_restore_$(date -u +%Y%m%d%H%M%S)_${RANDOM}"
./scripts/production/compose.sh exec -T db createdb -U kilora "$verify_db"
trap './scripts/production/compose.sh exec -T db dropdb -U kilora "$verify_db"' EXIT
./scripts/production/compose.sh exec -T db pg_restore -U kilora -d "$verify_db" --exit-on-error --no-owner --no-acl < "$backup_file"
./scripts/production/compose.sh exec -T db psql -U kilora -d "$verify_db" -v ON_ERROR_STOP=1 -c 'SELECT version_id FROM goose_db_version ORDER BY id DESC LIMIT 1' -c 'SELECT count(*) AS history_records FROM history_record'
printf 'Backup restored successfully to a disposable database.\n'
