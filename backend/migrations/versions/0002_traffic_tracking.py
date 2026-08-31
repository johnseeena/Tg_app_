"""peer traffic tracking columns

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-19

"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "peers",
        sa.Column("traffic_used_bytes", sa.BigInteger(), nullable=False, server_default="0"),
    )
    op.add_column(
        "peers",
        sa.Column("traffic_baseline_bytes", sa.BigInteger(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("peers", "traffic_baseline_bytes")
    op.drop_column("peers", "traffic_used_bytes")
