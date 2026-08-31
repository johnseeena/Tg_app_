# The official ghcr.io/xtls/xray-core image is distroless (no shell, no
# coreutils) — verified locally. Our entrypoint needs a shell to generate
# the REALITY keypair on first boot and render config from a template, so
# we copy just the (statically-linked, confirmed to run standalone) xray
# binary into a normal Alpine base rather than trying to script on top of
# the distroless image directly.
FROM ghcr.io/xtls/xray-core:latest AS xraybin

FROM alpine:3.20
RUN apk add --no-cache bash gettext
COPY --from=xraybin /usr/local/bin/xray /usr/local/bin/xray
RUN chmod +x /usr/local/bin/xray

COPY config.json.template /etc/xray/config.json.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
