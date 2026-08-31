"""partial-unique index on peers.assigned_ip (active peers only)

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-19

Without this, two concurrent `POST /api/peers` requests could both read
the same "next free IP" before either commits (ip_allocator.py has no
locking), silently handing out a duplicate IP to two different peers. The
DB constraint turns that race into a loud, retryable 409 instead of a
silent routing conflict — see routers/peers.py's IntegrityError handling.

Partial (WHERE revoked_at IS NULL), not a full-table unique constraint,
because ip_allocator.py intentionally reuses a revoked peer's IP for the
next device — a blanket constraint would permanently retire every IP a
peer ever used and exhaust the /24 over the service's lifetime.
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_peers_assigned_ip_active",
        "peers",
        ["assigned_ip"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_peers_assigned_ip_active", table_name="peers")
