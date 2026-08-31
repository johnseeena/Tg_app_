FROM python:3.12-alpine
# nss-tools provides certutil/pk12util, used against the SAME NSS sql:
# database the ipsec container's Libreswan/pluto reads (shared volume, see
# docker-compose.yml) — issuing/revoking client certs from here, matching
# amnezia-client's own Ikev2Configurator commands exactly. Verified
# locally that certs written by this Alpine's nss-tools are readable by
# the ipsec container's own (older Alpine 3.14-based) NSS build before
# deploying — cert9.db's sql format has been stable across NSS versions
# for years, but this was checked rather than assumed.
# bash: certutil's entropy source needs `<(process substitution)`, which
# plain Alpine `/bin/sh` (busybox ash) doesn't support — ikev2_manager.py
# explicitly runs that one command via /bin/bash.
# openssl: re-encodes the iOS .mobileconfig's PKCS#12 into the legacy PBE
# format (3DES/RC2-40/SHA1). Apple's profile parser can't decrypt the modern
# PBES2/AES-256 encoding pk12util emits and reports it as a wrong password on
# install — see ikev2_manager.reencode_p12_legacy.
RUN apk add --no-cache nss-tools bash openssl

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY migrations ./migrations
COPY alembic.ini .
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

HEALTHCHECK --interval=30s --timeout=3s CMD python -c \
    "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')" || exit 1

ENTRYPOINT ["/entrypoint.sh"]
