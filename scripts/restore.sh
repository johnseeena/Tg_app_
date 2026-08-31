#!/bin/bash
set -euo pipefail

# Restores a backup written by backup.sh. Assumes an empty target database
# (e.g. right after `docker compose down -v && docker compose up -d
# postgres` recreated the volume) — this does not drop existing tables
# first, so restoring on top of a live DB will fail on "already exists"
# rather than silently clobbering data.

cd "$(dirname "$0")/.."
set -a
source .env
set +a

if [ $# -ne 1 ]; then
    echo "usage: $0 <backup-file.sql.gz>" >&2
    exit 1
fi

echo "About to restore into database '$POSTGRES_DB'. This assumes an empty DB. Ctrl-C within 5s to abort."
sleep 5

gunzip -c "$1" | docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"

echo "[restore] done"
