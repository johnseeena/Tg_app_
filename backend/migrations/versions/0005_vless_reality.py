"""peers: drop assigned_ip, rename public_key -> client_uuid (VLESS+Reality pivot)

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-19

Replaces AmneziaWG with VLESS+Reality (via Xray-core) after confirming the
user's mobile carrier blocks AmneziaWG-family traffic outright, including
the pre-existing, separately-configured official Amnezia AmneziaWG setup on
the same server. VLESS+Reality has no per-client IP allocation (it's a TCP
proxy, not a virtual network interface), so assigned_ip and its partial
unique index are dropped. public_key (a WireGuard public key) is renamed to
client_uuid (a VLESS client UUID) — same role (the peer's protocol-level
identifier), different value shape, still unique+indexed.

Any pre-existing rows hold AmneziaWG-era values (WG public keys, real IPs)
that are meaningless under VLESS; this migration only changes the schema,
not the data — those peers are effectively defunct after this deploy and
should be revoked/recreated by their owners via the app.
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("uq_peers_assigned_ip_active", table_name="peers")
    op.drop_column("peers", "assigned_ip")
    op.alter_column("peers", "public_key", new_column_name="client_uuid")


def downgrade() -> None:
    op.alter_column("peers", "client_uuid", new_column_name="public_key")
    op.add_column("peers", sa.Column("assigned_ip", sa.String(45), nullable=False, server_default=""))
    op.create_index(
        "uq_peers_assigned_ip_active",
        "peers",
        ["assigned_ip"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
