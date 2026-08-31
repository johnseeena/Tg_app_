from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# All timestamp columns are TIMESTAMPTZ in the DB (see migrations/) —
# DateTime(timezone=True) must be explicit here to match, or asyncpg
# rejects timezone-aware Python datetimes with "can't subtract
# offset-naive and offset-aware datetimes" on write.
TZDateTime = DateTime(timezone=True)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(255))
    first_name: Mapped[str | None] = mapped_column(String(255))
    # "user" | "admin" — kept in sync with TELEGRAM_ADMIN_IDS on every login,
    # see deps.get_current_user.
    role: Mapped[str] = mapped_column(String(16), default="user", server_default="user")
    # "active" | "blocked"
    status: Mapped[str] = mapped_column(String(16), default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now())

    peers: Mapped[list["Peer"]] = relationship(back_populates="user")


class Peer(Base):
    __tablename__ = "peers"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(64))
    # IKEv2 client identifier — a 32-hex-char string, both the NSS cert
    # nickname/CN (`certutil -n/-s`) and the client cert's SAN, handed to
    # `certutil`/`pk12util` in app/ikev2_manager.py. The private key lives
    # only inside the ipsec container's NSS database; the backend only
    # ever receives back the exported, still-encrypted-in-transit .p12
    # bundle, never the raw key material directly. See PLAN.md.
    client_uuid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    traffic_limit_bytes: Mapped[int | None] = mapped_column(BigInteger())
    expires_at: Mapped[datetime | None] = mapped_column(TZDateTime)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(TZDateTime)

    # Cumulative bytes transferred over this peer's lifetime. Libreswan's
    # own per-connection counters (`ipsec whack --trafficstatus`) only
    # exist while a session is active and reset whenever it's
    # renegotiated/reconnected, so the enforcement loop tracks the raw
    # counter it last observed (traffic_baseline_bytes) and folds each
    # poll's delta into this persistent total — see app/enforcement.py.
    traffic_used_bytes: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    traffic_baseline_bytes: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")

    user: Mapped["User"] = relationship(back_populates="peers")


class AdminAuth(Base):
    """Single-row table (id is always 1) holding the admin-panel password.

    A second factor on top of the Telegram initData check: being an admin
    telegram_id gets you to the login prompt, but you also need this
    password. `password_hash IS NULL` means "still on the default password"
    — the app forces a change before any admin action is allowed. See
    app/admin_auth.py and deps.require_admin_session.
    """

    __tablename__ = "admin_auth"

    id: Mapped[int] = mapped_column(primary_key=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    updated_at: Mapped[datetime | None] = mapped_column(TZDateTime)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_telegram_id: Mapped[int] = mapped_column(BigInteger, index=True)
    action: Mapped[str] = mapped_column(String(64))
    target: Mapped[str | None] = mapped_column(String(255))
    detail: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(TZDateTime, server_default=func.now())
