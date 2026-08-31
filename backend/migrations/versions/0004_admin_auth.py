"""admin_auth single-row password table

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-19

Adds a password gate on the admin panel (a second factor on top of the
Telegram initData check). Seeds one row with a NULL hash, which the app
treats as "still on the default password (admin)" and forces the admin to
change before any admin action is allowed.
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_auth",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.bulk_insert(
        sa.table("admin_auth", sa.column("id", sa.Integer), sa.column("password_hash", sa.String)),
        [{"id": 1, "password_hash": None}],
    )


def downgrade() -> None:
    op.drop_table("admin_auth")
