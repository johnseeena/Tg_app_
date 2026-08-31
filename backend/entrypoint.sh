#!/bin/sh
set -e

for i in $(seq 1 30); do
    if alembic upgrade head; then
        break
    fi
    echo "[entrypoint] waiting for postgres... ($i/30)"
    sleep 2
done

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
