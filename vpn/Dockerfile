# AmneziaWG server container, built from source.
#
# Uses the userspace implementation (amneziawg-go) instead of the kernel
# module — works on any cloud VPS regardless of kernel support, at a small
# throughput cost that's irrelevant at ~50-user scale.
#
# Pin these to a released tag before any production deploy — "master" is
# fine for the initial Stage 0 bring-up but is not reproducible.
ARG AMNEZIAWG_GO_REF=master
ARG AMNEZIAWG_TOOLS_REF=master

FROM golang:1-alpine AS go-build
ARG AMNEZIAWG_GO_REF
RUN apk add --no-cache git make
RUN git clone --branch "${AMNEZIAWG_GO_REF}" --depth 1 \
    https://github.com/amnezia-vpn/amneziawg-go.git /src
WORKDIR /src
RUN make

FROM alpine:3.20 AS tools-build
ARG AMNEZIAWG_TOOLS_REF
RUN apk add --no-cache git make gcc musl-dev linux-headers libmnl-dev bash
RUN git clone --branch "${AMNEZIAWG_TOOLS_REF}" --depth 1 \
    https://github.com/amnezia-vpn/amneziawg-tools.git /src
WORKDIR /src/src
RUN make
RUN make install DESTDIR=/out PREFIX=/usr \
    WITH_WGQUICK=yes WITH_BASHCOMPLETION=no WITH_SYSTEMDUNITS=no

FROM alpine:3.20
RUN apk add --no-cache bash iptables ip6tables iproute2 libmnl gettext
COPY --from=go-build /src/amneziawg-go /usr/bin/amneziawg-go
COPY --from=tools-build /out/usr/bin/awg /usr/bin/awg
COPY --from=tools-build /out/usr/bin/awg-quick /usr/bin/awg-quick
RUN chmod +x /usr/bin/amneziawg-go /usr/bin/awg /usr/bin/awg-quick

COPY awg0.conf.template /etc/amnezia/awg0.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# awg-quick falls back to this userspace binary when the kernel module
# (amneziawg.ko) isn't loaded, same mechanism upstream wg-quick uses for
# wireguard-go.
ENV WG_QUICK_USERSPACE_IMPLEMENTATION=amneziawg-go

ENTRYPOINT ["/entrypoint.sh"]
