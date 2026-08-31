#!/bin/bash
set -euo pipefail

DATA_DIR=/etc/xray/data
PRIV_KEY_FILE="$DATA_DIR/reality_private.key"
PUB_KEY_FILE="$DATA_DIR/reality_public.key"
CONF_PATH=/etc/xray/config.json

mkdir -p "$DATA_DIR"

# REALITY keypair persists across restarts, same pattern as the old
# AmneziaWG server keypair: generated once, on first boot, never touches
# the frontend/backend — only this container and (read-only) the backend,
# which needs the public half to hand out in client configs.
if [ ! -f "$PRIV_KEY_FILE" ]; then
    echo "[entrypoint] no REALITY keypair found, generating one"
    umask 077
    keypair=$(/usr/local/bin/xray x25519)
    echo "$keypair" | sed -n 's/^PrivateKey: //p' > "$PRIV_KEY_FILE"
    # Different xray versions have labeled this line "PublicKey:" or
    # "Password (PublicKey):" — match either.
    echo "$keypair" | sed -n 's/^\(PublicKey\|Password (PublicKey)\): //p' > "$PUB_KEY_FILE"
    chmod 600 "$PRIV_KEY_FILE"
fi

export XRAY_REALITY_PRIVATE_KEY
XRAY_REALITY_PRIVATE_KEY=$(cat "$PRIV_KEY_FILE")

umask 077
envsubst < /etc/xray/config.json.template > "$CONF_PATH"

echo "[entrypoint] REALITY public key: $(cat "$PUB_KEY_FILE")"
echo "[entrypoint] starting xray on port ${XRAY_PORT}, dest=${XRAY_REALITY_DEST}"
echo "[entrypoint] interface is up with zero users — the backend reconciles"
echo "[entrypoint] users from Postgres into the live inbound on its own startup"

exec /usr/local/bin/xray run -c "$CONF_PATH"
