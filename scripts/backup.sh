#!/bin/bash
set -euo pipefail

# Dumps Postgres (users, peer client UUIDs, audit log) to a gzipped SQL
# file and prunes old backups. Meant for cron/systemd, not interactive use
# — see docs/DEPLOY.md for how to schedule it.

cd "$(dirname "$0")/.."
set -a
source .env
set +a

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
    | gzip > "$BACKUP_DIR/${POSTGRES_DB}_${TIMESTAMP}.sql.gz"

find "$BACKUP_DIR" -name "${POSTGRES_DB}_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete

echo "[backup] wrote $BACKUP_DIR/${POSTGRES_DB}_${TIMESTAMP}.sql.gz"
