#!/bin/bash
set -euo pipefail

DATA_DIR=/etc/openvpn/data
PKI_DIR="$DATA_DIR/pki"
TA_KEY="$DATA_DIR/ta.key"
CONF_PATH=/etc/openvpn/server.conf

export EASYRSA_BATCH=1
export EASYRSA_PKI="$PKI_DIR"

mkdir -p "$DATA_DIR"

# PKI is generated once, on first boot, and persisted in the ovpn-data
# volume (shared read-write with the backend container, which runs the
# same `easyrsa` binary against these same files to issue/revoke client
# certs — see backend/app/openvpn_manager.py). Everything here is
# idempotent-guarded so a container restart never re-generates a CA (which
# would invalidate every already-issued client cert).
if [ ! -f "$PKI_DIR/ca.crt" ]; then
    echo "[entrypoint] no PKI found, initializing (first boot)"
    easyrsa init-pki
    easyrsa --req-cn="AmneziaTgApp-CA" build-ca nopass
    easyrsa build-server-full server nopass
    # 2048-bit DH is the slow step (can take minutes on a 1 vCPU box) —
    # only ever done once, persisted alongside the rest of the PKI.
    easyrsa gen-dh
    openvpn --genkey secret "$TA_KEY"
    easyrsa gen-crl
fi

# easyrsa writes the file as crl.pem by default; refresh permissions since
# crl-verify below needs it world-readable inside the container.
chmod 644 "$PKI_DIR/crl.pem" 2>/dev/null || true

# NAT masquerade so tunneled clients can reach the internet through this
# host's own public interface. Idempotent: -C checks before -A inserts, so
# a container restart doesn't pile up duplicate rules.
if ! iptables -t nat -C POSTROUTING -s "${OVPN_SUBNET_CIDR}" -o "${OVPN_EXTERNAL_IF}" -j MASQUERADE 2>/dev/null; then
    iptables -t nat -A POSTROUTING -s "${OVPN_SUBNET_CIDR}" -o "${OVPN_EXTERNAL_IF}" -j MASQUERADE
fi
# Primarily set via docker-compose's `sysctls:` on this service (needs no
# extra privilege there); this is just a best-effort fallback for restricted
# environments where writing /proc/sys directly isn't permitted at all.
echo 1 > /proc/sys/net/ipv4/ip_forward 2>/dev/null || true

umask 077
envsubst < /etc/openvpn/server.conf.template > "$CONF_PATH"

echo "[entrypoint] starting openvpn on 127.0.0.1:${OVPN_PORT} (tcp), management on 127.0.0.1:${OVPN_MGMT_PORT}"
echo "[entrypoint] cloak-server reaches this over loopback (shared network namespace) — see docker-compose.yml"

exec openvpn --config "$CONF_PATH"
