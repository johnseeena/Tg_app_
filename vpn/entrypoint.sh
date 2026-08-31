#!/bin/bash
set -euo pipefail

DATA_DIR=/etc/amnezia/vpn
CONF_PATH="$DATA_DIR/${AWG_INTERFACE}.conf"
PRIV_KEY_FILE="$DATA_DIR/server_private.key"
PUB_KEY_FILE="$DATA_DIR/server_public.key"

mkdir -p "$DATA_DIR"

# Server keypair persists in the vpn-data volume across restarts. This is
# the VPN server's own key (required for WireGuard to work at all) — not to
# be confused with client private keys, which are generated on-device and
# never touch this container or the backend.
if [ ! -f "$PRIV_KEY_FILE" ]; then
    echo "[entrypoint] no server keypair found, generating one"
    umask 077
    awg genkey > "$PRIV_KEY_FILE"
    awg pubkey < "$PRIV_KEY_FILE" > "$PUB_KEY_FILE"
    chmod 600 "$PRIV_KEY_FILE"
fi

export AWG_SERVER_PRIVATE_KEY
AWG_SERVER_PRIVATE_KEY=$(cat "$PRIV_KEY_FILE")

umask 077
envsubst < /etc/amnezia/awg0.conf.template > "$CONF_PATH"

cleanup() {
    echo "[entrypoint] shutting down ${AWG_INTERFACE}"
    awg-quick down "$CONF_PATH" || true
    exit 0
}
trap cleanup TERM INT

echo "[entrypoint] bringing up ${AWG_INTERFACE}"
awg-quick up "$CONF_PATH"

echo "[entrypoint] server public key: $(cat "$PUB_KEY_FILE")"
echo "[entrypoint] interface is up with zero peers — the backend reconciles"
echo "[entrypoint] peers from Postgres into the live interface on its own startup"

# Keep the container in the foreground so Docker can supervise it and so
# the TERM trap above runs `awg-quick down` for clean iptables teardown.
tail -f /dev/null &
wait $!
