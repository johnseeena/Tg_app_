import asyncio
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from . import audit, ikev2_manager, models, telegram_bot
from .db import SessionLocal

# Sentinel actor_telegram_id for audit-log entries the enforcement loop
# writes itself, distinguishing them from real admin/user actions.
SYSTEM_ACTOR_ID = 0

POLL_INTERVAL_SECONDS = 60


async def enforce_once() -> None:
    async with SessionLocal() as session:
        result = await session.execute(
            select(models.Peer)
            .options(selectinload(models.Peer.user))
            .where(models.Peer.revoked_at.is_(None))
        )
        peers = result.scalars().all()
        if not peers:
            return

        stats = await ikev2_manager.list_traffic_stats()
        now = datetime.now(timezone.utc)
        notifications: list[tuple[int, str]] = []

        for peer in peers:
            in_bytes, out_bytes = stats.get(peer.client_uuid, (0, 0))
            raw = in_bytes + out_bytes
            # A raw counter smaller than our last-seen baseline means the
            # session was renegotiated/reconnected and Libreswan's own
            # per-connection counters reset to 0 — treat the new raw value
            # as the delta rather than going negative. A peer with no
            # active session right now simply reports (0, 0) here, which
            # also correctly resolves to "no new usage this poll" without
            # ever decreasing traffic_used_bytes.
            delta = raw - peer.traffic_baseline_bytes if raw >= peer.traffic_baseline_bytes else raw
            peer.traffic_used_bytes += delta
            peer.traffic_baseline_bytes = raw

            expired = peer.expires_at is not None and peer.expires_at <= now
            over_limit = peer.traffic_limit_bytes is not None and peer.traffic_used_bytes >= peer.traffic_limit_bytes
            if not (expired or over_limit):
                continue

            await ikev2_manager.delete_client_cert(peer.client_uuid)
            peer.revoked_at = now
            reason = "expired" if expired else "traffic_limit"
            await audit.log(
                session,
                actor_telegram_id=SYSTEM_ACTOR_ID,
                action=f"peer.revoke.auto_{reason}",
                target=str(peer.id),
            )
            reason_text = "it expired" if expired else "it hit its traffic limit"
            notifications.append(
                (peer.user.telegram_id, f'Your device "{peer.name}" was automatically revoked — {reason_text}.')
            )

        await session.commit()

    # Sent only after a successful commit — the revoke actually happened by
    # the time anyone hears about it.
    for telegram_id, text in notifications:
        await telegram_bot.send_message(telegram_id, text)


async def run_forever() -> None:
    while True:
        try:
            await enforce_once()
        except Exception as exc:
            # Must never let one bad poll (a transient certutil/DB hiccup)
            # kill the loop — every peer would silently stop being enforced.
            print(f"[enforcement] error: {exc}")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
