FROM alpine:3.20
RUN apk add --no-cache openvpn easy-rsa iptables bash gettext openssl

# Alpine's easy-rsa package installs the toolkit under /usr/share/easy-rsa
# with a wrapper script at /usr/share/easy-rsa/easyrsa — symlink it onto
# PATH so entrypoint.sh (and the backend, which runs the same binary
# against this shared PKI volume) can just call `easyrsa`.
RUN ln -s /usr/share/easy-rsa/easyrsa /usr/local/bin/easyrsa

COPY server.conf.template /etc/openvpn/server.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
