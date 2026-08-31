from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import ikev2_manager, models


async def reconcile_all_peers(session: AsyncSession) -> int:
    """Unlike this project's earlier xray/Cloak attempts, the NSS cert
    database is a real on-disk store (in the ipsec-data volume) that
    survives container restarts — there's no in-memory user list to
    rebuild here. This just checks for drift: an active DB peer whose
    cert somehow isn't in the NSS db anymore (e.g. the volume was
    restored from an older backup than Postgres) can't be silently
    re-issued — the original entropy/private key is gone — so it's only
    logged, not auto-repaired. Returns the count of active peers found
    (for the same startup-log line prior protocols used), not a "repaired"
    count.
    """
    result = await session.execute(
        select(models.Peer)
        .join(models.User)
        .where(models.Peer.revoked_at.is_(None), models.User.status == "active")
    )
    peers = result.scalars().all()

    try:
        listed = await ikev2_manager.list_client_ids()
    except Exception as exc:  # pragma: no cover - best-effort diagnostic only
        print(f"[reconcile] could not list NSS certs: {exc}")
        return len(peers)

    missing = [p.client_uuid for p in peers if p.client_uuid not in listed]
    for client_id in missing:
        print(f"[reconcile] WARNING: active peer {client_id} has no matching NSS cert — needs revoke+recreate")

    return len(peers)
