#!/bin/bash
set -euo pipefail

NSS_DB=/etc/ipsec.d
CA_CERT_FILE="$NSS_DB/ca_cert_base64.p12"

mkdir -p /opt/amnezia/ikev2/clients /run/pluto /var/run/pluto

# NSS cert database + CA are generated once, on first boot, and persisted
# in the ipsec-data volume (shared read-write with the backend container,
# which runs the same `certutil`/`pk12util` binaries against these same
# files to issue/delete client certs — see backend/app/ikev2_manager.py).
# Idempotent-guarded so a restart never regenerates the CA (which would
# invalidate every already-issued client cert).
if [ ! -f "$CA_CERT_FILE" ]; then
    echo "[entrypoint] no NSS cert database found, initializing (first boot)"
    ipsec initnss >/dev/null

    # Same CA name/params Amnezia's own installer uses (verified against
    # amnezia-client's server_scripts/ipsec/configure_container.sh) — the
    # exact name doesn't matter for our own clients, but matching it costs
    # nothing and rules out any hidden assumption elsewhere in the Amnezia
    # client about this string.
    printf "y\n\nN\n" | certutil -z <(head -c 1024 /dev/urandom) \
        -S -x -n "IKEv2 VPN CA" \
        -s "O=IKEv2 VPN,CN=IKEv2 VPN CA" \
        -k rsa -g 3072 -v 120 \
        -d sql:"$NSS_DB" -t "CT,," -2

    certutil -z <(head -c 1024 /dev/urandom) \
        -S -c "IKEv2 VPN CA" -n "$IPSEC_SERVER_IP" \
        -s "O=IKEv2 VPN,CN=$IPSEC_SERVER_IP" \
        -k rsa -g 3072 -v 120 \
        -d sql:"$NSS_DB" -t ",," \
        --keyUsage digitalSignature,keyEncipherment \
        --extKeyUsage serverAuth \
        --extSAN "ip:$IPSEC_SERVER_IP,dns:$IPSEC_SERVER_IP"

    certutil -L -d sql:"$NSS_DB" -n "IKEv2 VPN CA" -a | grep -v CERTIFICATE > "$CA_CERT_FILE"
fi

# L2TP/IPsec is for router clients (Keenetic and similar) whose built-in VPN
# client only speaks IKEv2-EAP / L2TP username-password, NOT the certificate
# auth the phones/desktops use. Optional: only configured when L2TP_PSK is set.
# Single shared credential (one router), from the .env — a deliberately
# weaker, shared-secret model than the per-device certs, accepted knowingly
# for the router use case. Rides the same UDP 500/4500 the cert IKEv2 already
# uses (L2TP/1701 is encapsulated inside IPsec), so no new external ports.
L2TP_ENABLED=0
if [ -n "${L2TP_PSK:-}" ]; then
    L2TP_ENABLED=1
    L2TP_NET="${L2TP_NET:-192.168.42.0/24}"
    L2TP_LOCAL_IP="${L2TP_LOCAL_IP:-192.168.42.1}"
    L2TP_POOL="${L2TP_POOL:-192.168.42.10-192.168.42.250}"
    DNS1="${IPSEC_DNS%%,*}"
    DNS2="${IPSEC_DNS##*,}"
fi

# NAT masquerade so tunneled clients can reach the internet through this
# host's own public interface. Idempotent: -C checks before -A inserts, so
# a container restart doesn't pile up duplicate rules.
add_masq() {
    if ! iptables -t nat -C POSTROUTING -s "$1" -o "${IPSEC_EXTERNAL_IF}" -j MASQUERADE 2>/dev/null; then
        iptables -t nat -A POSTROUTING -s "$1" -o "${IPSEC_EXTERNAL_IF}" -j MASQUERADE
    fi
}
add_fwd() {
    if ! iptables -C FORWARD "$@" 2>/dev/null; then
        iptables -A FORWARD "$@"
    fi
}
add_masq "${IPSEC_NETWORK}"
if [ "$L2TP_ENABLED" = 1 ]; then
    add_masq "${L2TP_NET}"
    # ppp+ interfaces (created per L2TP session) aren't covered by the XFRM
    # path the cert-IKEv2 clients use, so forwarding for them is explicit.
    add_fwd -s "${L2TP_NET}" -j ACCEPT
    add_fwd -d "${L2TP_NET}" -j ACCEPT
fi

# TCP MSS clamping: IPsec/ESP encapsulation adds ~60-100 bytes of overhead
# that a client's virtual VPN adapter doesn't account for (it still
# advertises MTU 1500), and if PMTU discovery's ICMP "fragmentation needed"
# is filtered anywhere on the path — extremely common with home routers/ISPs
# — oversized TCP segments just get silently dropped. Symptom: VPN shows
# "connected", DNS/ping (small packets) work, but browsing hangs/times out —
# reported as "internet falls" after connecting on a real Windows 11 client.
# This is standard practice for any road-warrior IPsec/IKEv2 VPN (the base
# image's hwdsl2 lineage normally sets this up; it was dropped when this
# entrypoint replaced its default iptables setup with its own rules above).
# --clamp-mss-to-pmtu computes the right value per-path automatically rather
# than hardcoding one, so it stays correct across different client MTUs.
if ! iptables -t mangle -C FORWARD -o "${IPSEC_EXTERNAL_IF}" -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu 2>/dev/null; then
    iptables -t mangle -A FORWARD -o "${IPSEC_EXTERNAL_IF}" -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
fi

sysctl -e -q -w net.ipv4.ip_forward=1 2>/dev/null || true
sysctl -e -q -w net.ipv4.conf.all.accept_redirects=0 2>/dev/null || true
sysctl -e -q -w net.ipv4.conf.all.send_redirects=0 2>/dev/null || true

cat > /etc/ipsec.conf <<EOF
version 2.0

config setup
  uniqueids=no

conn ikev2-cp
  left=%defaultroute
  leftcert=$IPSEC_SERVER_IP
  leftid=$IPSEC_SERVER_IP
  leftsendcert=always
  leftsubnet=0.0.0.0/0
  leftrsasigkey=%cert
  right=%any
  rightid=%fromcert
  rightaddresspool=${IPSEC_POOL_START}-${IPSEC_POOL_END}
  rightca=%same
  rightrsasigkey=%cert
  narrowing=yes
  dpddelay=30
  dpdtimeout=120
  dpdaction=clear
  auto=add
  ikev2=insist
  rekey=no
  pfs=yes
  ike=aes256-sha2,aes128-sha2,aes256-sha1,aes128-sha1,aes256-sha2;modp2048,aes128-sha1;modp2048
  phase2alg=aes_gcm-null,aes128-sha1,aes256-sha1,aes256-sha2_512,aes128-sha2,aes256-sha2
  ikelifetime=24h
  salifetime=24h
  encapsulation=yes
  modecfgdns=${IPSEC_DNS}
EOF

if [ "$L2TP_ENABLED" = 1 ]; then
    # Classic L2TP/IPsec-PSK conn (IKEv1, transport mode) — the shape
    # Keenetic/Windows/Android L2TP clients expect. Broad IKE/ESP proposals
    # incl. modp1024 (DH2), which older router L2TP clients still default to.
    cat >> /etc/ipsec.conf <<EOF

conn l2tp-psk
  auto=add
  leftprotoport=17/1701
  rightprotoport=17/%any
  type=transport
  left=%defaultroute
  leftid=$IPSEC_SERVER_IP
  right=%any
  ikev2=never
  authby=secret
  pfs=no
  rekey=no
  keyingtries=3
  dpddelay=30
  dpdtimeout=120
  dpdaction=clear
  ike=aes256-sha2,aes128-sha2,aes256-sha1,aes128-sha1,aes256-sha1;modp1024,aes128-sha1;modp1024,aes256-sha2;modp2048
  phase2alg=aes256-sha1,aes128-sha1,aes256-sha2,aes128-sha2,aes256-sha2_512,3des-sha1
  sha2-truncbug=no
EOF

    printf '%%any %%any : PSK "%s"\n' "$L2TP_PSK" > /etc/ipsec.d/l2tp.secrets
    chmod 600 /etc/ipsec.d/l2tp.secrets

    cat > /etc/xl2tpd/xl2tpd.conf <<EOF
[global]
port = 1701
access control = no

[lns default]
ip range = ${L2TP_POOL}
local ip = ${L2TP_LOCAL_IP}
require chap = yes
refuse pap = yes
require authentication = yes
name = l2tpd
pppoptfile = /etc/ppp/options.xl2tpd
length bit = yes
EOF

    cat > /etc/ppp/options.xl2tpd <<EOF
+mschap-v2
ipcp-accept-local
ipcp-accept-remote
noccp
auth
mtu 1280
mru 1280
proxyarp
lcp-echo-failure 4
lcp-echo-interval 30
connect-delay 5000
ms-dns ${DNS1}
ms-dns ${DNS2}
name l2tpd
EOF

    # One shared router credential. `*` server field so xl2tpd's LNS name
    # doesn't have to be matched exactly.
    printf '"%s" * "%s" *\n' "$L2TP_USER" "$L2TP_PASSWORD" > /etc/ppp/chap-secrets
    chmod 600 /etc/ppp/chap-secrets

    # Kernel L2TP mode needs these modules from the host. Best-effort — the
    # host (Ubuntu) has them; if a kernel ever lacks them xl2tpd logs will show it.
    modprobe l2tp_ppp 2>/dev/null || true
    modprobe pppol2tp 2>/dev/null || true
    mkdir -p /var/run/xl2tpd
    rm -f /var/run/xl2tpd/l2tp-control
fi

rm -f /run/pluto/pluto.pid /var/run/pluto/pluto.pid

echo "[entrypoint] starting pluto (Libreswan), CA + server cert for $IPSEC_SERVER_IP"
echo "[entrypoint] backend reaches the NSS cert db over the shared ipsec-data volume"
echo "[entrypoint] to issue/delete per-device client certs — no in-memory user list"
if [ "$L2TP_ENABLED" = 1 ]; then
    echo "[entrypoint] L2TP/IPsec enabled for router clients (user: ${L2TP_USER})"
    # -D keeps xl2tpd in the foreground so its logs land in `docker logs`;
    # backgrounded so pluto stays the container's main (exec'd) process.
    xl2tpd -D -c /etc/xl2tpd/xl2tpd.conf >/tmp/xl2tpd.log 2>&1 &
fi

exec ipsec pluto --config /etc/ipsec.conf --nofork --stderrlog
