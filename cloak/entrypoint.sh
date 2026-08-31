#!/bin/sh
set -eu

DATA_DIR=/etc/cloak/data
PRIV_KEY_FILE="$DATA_DIR/private.key"
PUB_KEY_FILE="$DATA_DIR/public.key"
ADMIN_UID_FILE="$DATA_DIR/admin_uid"
CONF_PATH=/etc/cloak/ckserver.json

mkdir -p "$DATA_DIR"

# Keypair + AdminUID + the user database (userinfo.db, referenced by the
# rendered config's DatabasePath) all persist across restarts in the
# cloak-data volume — Cloak's own BoltDB-backed usermanager is what makes
# per-peer add/remove NOT require a ck-server restart (unlike this
# project's earlier xray-core setup, where the in-memory user list reset
# on every restart and had to be reconciled from Postgres on backend
# startup). Only the keypair/AdminUID generation itself is first-boot-only.
if [ ! -f "$PRIV_KEY_FILE" ]; then
    echo "[entrypoint] no Cloak keypair found, generating one"
    umask 077
    keypair=$(/usr/local/bin/ck-server -k)
    pub=$(echo "$keypair" | cut -d',' -f1)
    priv=$(echo "$keypair" | cut -d',' -f2)
    echo "$pub" > "$PUB_KEY_FILE"
    echo "$priv" > "$PRIV_KEY_FILE"
    /usr/local/bin/ck-server -u > "$ADMIN_UID_FILE"
    chmod 600 "$PRIV_KEY_FILE" "$ADMIN_UID_FILE"
fi

export CLOAK_PRIVATE_KEY
CLOAK_PRIVATE_KEY=$(cat "$PRIV_KEY_FILE")
export CLOAK_ADMIN_UID
CLOAK_ADMIN_UID=$(cat "$ADMIN_UID_FILE")

umask 077
envsubst < /etc/cloak/ckserver.json.template > "$CONF_PATH"

echo "[entrypoint] Cloak public key: $(cat "$PUB_KEY_FILE")"
echo "[entrypoint] starting ck-server on :${CLOAK_PORT}, redirecting non-Cloak traffic to ${CLOAK_REDIR_ADDR}"

exec /usr/local/bin/ck-server -c "$CONF_PATH"
