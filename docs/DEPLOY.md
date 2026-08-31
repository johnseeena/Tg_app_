# Deploy guide

This was built and validated locally, including full end-to-end runs of the
Docker stack (this session has no access to your actual VPS — there's no
SSH tool available here). Everything below you run yourself on the server.

## 1. Provision the server

- Fresh KVM VPS, public IPv4, Ubuntu 22.04/24.04 or Debian 12/13
- Minimum: 1 vCPU / 1 GB RAM / 10 GB SSD (fine at ~50-user scale)
- Point a DNS A record for your domain at the server's IPv4 (needed for
  Caddy's automatic TLS)

## 2. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# log out/in (or `newgrp docker`) for the group change to apply
```

## 3. Get the project onto the server

Any of: `git clone` your repo, `scp -r`, or `rsync -av`. Example:

```bash
rsync -av --exclude .env --exclude docker-compose.override.yml \
    ./Tg_app_/ user@your-server:/opt/amnezia-tg-app/
```

`docker-compose.override.yml` is a local-dev-only convenience that
publishes the backend's port directly, bypassing Caddy/TLS — Compose loads
it automatically if it's present, so it must not end up on the server. If
you do use `git clone` instead, just don't create/commit-and-push it, or
delete it on the server after cloning.

## 4. Configure `.env`

```bash
cd /opt/amnezia-tg-app
cp .env.example .env
chmod 600 .env   # contains POSTGRES_PASSWORD and TELEGRAM_BOT_TOKEN
```

Fill in:

- `DOMAIN`, `ACME_EMAIL` — real domain pointed at this server, real email
- `XRAY_ENDPOINT_HOST` — the server's raw public IP, more reliable than
  `DOMAIN` on mobile networks whose DNS may be unreliable
- `TELEGRAM_BOT_TOKEN` — from @BotFather
- `TELEGRAM_ADMIN_IDS` — your numeric Telegram user ID(s), comma-separated
  (get yours from @userinfobot)
- `POSTGRES_PASSWORD` — generate: `openssl rand -base64 32`
- `XRAY_REALITY_DEST` / `XRAY_REALITY_SERVER_NAME` — a real, reliably
  reachable TLS 1.3 site not itself blocked on the networks your clients
  use. The default (`www.microsoft.com:443`) is a reasonable start.
- `XRAY_SHORT_ID` — generate fresh per deployment, do not reuse the example:

  ```bash
  python3 -c "import secrets; print(secrets.token_hex(8))"
  ```

The REALITY keypair itself is **not** an `.env` value — the `xray`
container generates it on first boot and persists it in the `xray-data`
volume (see `xray/entrypoint.sh`). The backend reads the public half from
there to hand out in client links; nothing needs to be copied by hand.

## 5. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp                 # ACME HTTP-01 challenge
sudo ufw allow 443/tcp                # Caddy / API / Mini App
sudo ufw allow "$(grep ^XRAY_PORT .env | cut -d= -f2)"/tcp   # VLESS+Reality
sudo ufw enable
```

Also confirm SSH is key-only (`PasswordAuthentication no` in
`/etc/ssh/sshd_config`) before exposing this box publicly.

## 6. Build and start

```bash
docker compose build
docker compose up -d
docker compose logs -f xray
```

Expect to see `starting xray on port ...` and a printed REALITY public key.
`Ctrl-C` to stop following logs (containers keep running).

## 7. Verify

```bash
docker compose exec xray xray api statsquery -s 127.0.0.1:10085 -pattern x
curl -s https://$DOMAIN/api/healthz   # -> {"status":"ok"}
curl -s https://$DOMAIN/              # -> the Mini App's index.html
```

If the TLS cert doesn't issue, check `docker compose logs caddy` — usually
DNS not yet pointed at the server, or port 80/443 blocked upstream.

## 8. Register the bot and open the Mini App

- Talk to @BotFather: `/newbot` (if you haven't already — must match
  `TELEGRAM_BOT_TOKEN`), then `/newapp` (or `/setmenubutton`) pointing at
  `https://$DOMAIN`.
- Open the bot in Telegram and launch the Mini App. The first admin ID in
  `TELEGRAM_ADMIN_IDS` sees the Admin tab automatically — no manual role
  setup needed.
- Add a device from the Mini App, confirm it shows up under the admin
  panel's VPN tab, and that the device actually connects (tapping "Open in
  Amnezia VPN" should launch the app and connect through REALITY).

For a lower-level check without the Mini App (e.g. debugging), you can
query the live user list directly: `docker compose exec xray xray api
inbounduser -s 127.0.0.1:10085 -tag=vless-in -email=<CLIENT_UUID>` — but
prefer testing through the real API/Mini App, since anything added this
way bypasses the DB and the backend's reconcile loop won't know about it.

## Operational gotcha: restarting `xray` also requires restarting `backend`

`backend` runs with `network_mode: "service:xray"` (shares xray's network
namespace so it can reach xray's loopback-only gRPC API directly, without
Docker-socket access). Restarting or rebuilding the `xray` container
recreates that namespace and silently orphans backend's networking — it
keeps running but can no longer reach Postgres or receive HTTP traffic.
Always follow with:

```bash
docker compose up -d --force-recreate xray
docker compose up -d --force-recreate backend   # do this every time you touch xray
```

## Backups

`scripts/backup.sh` dumps Postgres (users, peer client UUIDs, limits, audit
log) to a gzipped file in `./backups`, pruning anything older than
`BACKUP_RETENTION_DAYS` (default 14).

```bash
chmod +x scripts/backup.sh scripts/restore.sh
./scripts/backup.sh   # test it manually once
```

Schedule it daily via cron:

```bash
sudo tee /etc/cron.d/amnezia-tg-app-backup <<'EOF'
0 3 * * * root cd /opt/amnezia-tg-app && ./scripts/backup.sh >> /var/log/amnezia-backup.log 2>&1
EOF
```

To restore (assumes an empty DB — see the script's header comment):

```bash
./scripts/restore.sh backups/vpnbot_20260101_030000.sql.gz
```

Stateful volumes, for reference:
- `pg-data` — Postgres data (what backup.sh backs up)
- `xray-data` — the REALITY server keypair (not client credentials) —
  losing this just means a forced key rotation (see Mini App admin panel),
  not data loss
- `caddy-data`, `caddy-config`, `frontend-dist` — regenerated
  automatically, nothing to back up

## Health checks

`postgres` and `xray` have Docker `HEALTHCHECK`s (`pg_isready`, `xray api
statsquery`); `backend` has one on `/healthz`. `docker compose ps` shows
status; `docker compose logs -f <service>` for details. At ~50-user scale a
full metrics stack (Prometheus/Grafana) is more operational overhead than
this project needs — healthchecks + logs + the Mini App's own VPN-status
admin tab are enough to notice and diagnose problems.

## Done criteria

- [ ] `docker compose up -d` brings up all services healthy (`docker compose ps`)
- [ ] `docker compose logs xray` shows it listening with the configured port and a REALITY public key
- [ ] `https://$DOMAIN/` serves the Mini App and `/api/healthz` returns 200, both over valid TLS
- [ ] Bot registered with @BotFather, Mini App opens, admin tab visible to the configured admin ID
- [ ] A real device added through the Mini App shows up in the admin VPN tab and can actually tunnel
- [ ] `./scripts/backup.sh` runs successfully and is scheduled in cron
