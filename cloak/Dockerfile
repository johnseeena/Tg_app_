# No official prebuilt image or Dockerfile ships a runnable binary — the
# upstream Dockerfile (github.com/cbeuw/Cloak/blob/master/Dockerfile) is
# just `git clone` + `make` on a full golang:latest image, so we do the
# same in a builder stage and copy the two resulting static binaries
# (ck-server, ck-client) into a slim runtime image. Verified locally: `make
# all` with CGO_ENABLED=0 produces working static binaries.
FROM golang:1.24-alpine AS build
RUN apk add --no-cache git make
RUN git clone --depth 1 https://github.com/cbeuw/Cloak.git /src
WORKDIR /src
ENV CGO_ENABLED=0
RUN make all

FROM alpine:3.20
RUN apk add --no-cache gettext
COPY --from=build /src/build/ck-server /usr/local/bin/ck-server
COPY --from=build /src/build/ck-client /usr/local/bin/ck-client
RUN chmod +x /usr/local/bin/ck-server /usr/local/bin/ck-client

COPY ckserver.json.template /etc/cloak/ckserver.json.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
