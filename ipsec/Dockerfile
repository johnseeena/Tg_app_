# Amnezia's own maintained IKEv2/IPsec (Libreswan) server image — see
# docker-compose.yml's comment for why we deploy this exact image rather
# than building our own: byte-for-byte compatibility with what the
# Amnezia app itself expects to import (CA naming, NSS cert-store layout,
# client cert/.p12 export commands), verified against amnezia-client's
# ikev2Configurator.cpp.
#
# The image's own default entrypoint is a no-op (`dumb-init tail -f
# /dev/null`) — Amnezia's app does all real setup via `docker exec` after
# the fact. We replace it entirely with our own entrypoint.sh, which does
# the equivalent of Amnezia's server_scripts/ipsec/configure_container.sh
# but IKEv2-only (no L2TP/XAuth — smaller attack surface, and it's the
# only mode this project's clients use) and idempotent-guarded so a
# container restart never regenerates the CA.
FROM amneziavpn/ipsec-server:latest

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
