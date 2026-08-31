from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import audit, ikev2_manager, models, schemas, telegram_bot
from ..db import get_session
from ..deps import require_admin_session

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[schemas.AdminUserOut])
async def list_users(
    admin: models.User = Depends(require_admin_session),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(models.User))
    users = result.scalars().all()

    out = []
    for u in users:
        count_result = await session.execute(
            select(func.count())
            .select_from(models.Peer)
            .where(models.Peer.user_id == u.id, models.Peer.revoked_at.is_(None))
        )
        out.append(
            schemas.AdminUserOut(
                id=u.id,
                telegram_id=u.telegram_id,
                username=u.username,
                role=u.role,
                status=u.status,
                active_peer_count=count_result.scalar_one(),
                created_at=u.created_at,
            )
        )
    return out


@router.post("/users/{telegram_id}/block", status_code=204)
async def block_user(
    telegram_id: int,
    admin: models.User = Depends(require_admin_session),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(models.User).where(models.User.telegram_id == telegram_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    if target.role == "admin":
        raise HTTPException(status_code=400, detail="cannot block an admin")

    target.status = "blocked"

    peers_result = await session.execute(
        select(models.Peer).where(models.Peer.user_id == target.id, models.Peer.revoked_at.is_(None))
    )
    for peer in peers_result.scalars().all():
        await ikev2_manager.delete_client_cert(peer.client_uuid)
        peer.revoked_at = func.now()

    await audit.log(session, actor_telegram_id=admin.telegram_id, action="user.block", target=str(telegram_id))
    await telegram_bot.send_message(telegram_id, "An admin has blocked your account. Your devices have been disconnected.")


@router.post("/users/{telegram_id}/unblock", status_code=204)
async def unblock_user(
    telegram_id: int,
    admin: models.User = Depends(require_admin_session),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(models.User).where(models.User.telegram_id == telegram_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")

    target.status = "active"
    await audit.log(session, actor_telegram_id=admin.telegram_id, action="user.unblock", target=str(telegram_id))


@router.get("/peers", response_model=list[schemas.AdminPeerOut])
async def list_all_peers(
    admin: models.User = Depends(require_admin_session),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(models.Peer).where(models.Peer.revoked_at.is_(None)))
    return result.scalars().all()


@router.delete("/peers/{peer_id}", status_code=204)
async def revoke_any_peer(
    peer_id: int,
    admin: models.User = Depends(require_admin_session),
    session: AsyncSession = Depends(get_session),
):
    peer = await session.get(models.Peer, peer_id)
    if peer is None or peer.revoked_at is not None:
        raise HTTPException(status_code=404, detail="peer not found")

    await ikev2_manager.delete_client_cert(peer.client_uuid)
    peer.revoked_at = func.now()
    await audit.log(session, actor_telegram_id=admin.telegram_id, action="peer.revoke.admin", target=str(peer.id))


@router.patch("/peers/{peer_id}/limits", response_model=schemas.AdminPeerOut)
async def update_peer_limits(
    peer_id: int,
    body: schemas.PeerLimitsUpdate,
    admin: models.User = Depends(require_admin_session),
    session: AsyncSession = Depends(get_session),
):
    peer = await session.get(models.Peer, peer_id)
    if peer is None or peer.revoked_at is not None:
        raise HTTPException(status_code=404, detail="peer not found")

    expires_at = body.expires_at
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    peer.traffic_limit_bytes = body.traffic_limit_bytes
    peer.expires_at = expires_at
    await audit.log(
        session,
        actor_telegram_id=admin.telegram_id,
        action="peer.limits.update",
        target=str(peer.id),
        detail=f"limit={body.traffic_limit_bytes} expires={expires_at}",
    )
    return peer


@router.get("/vpn/status", response_model=schemas.VpnStatus)
async def vpn_status(
    admin: models.User = Depends(require_admin_session),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(models.Peer).where(models.Peer.revoked_at.is_(None)))
    peers = result.scalars().all()
    stats = await ikev2_manager.list_traffic_stats()

    out = [
        schemas.VpnPeerStatus(
            client_uuid=peer.client_uuid,
            in_bytes=stats.get(peer.client_uuid, (0, 0))[0],
            out_bytes=stats.get(peer.client_uuid, (0, 0))[1],
        )
        for peer in peers
    ]
    return schemas.VpnStatus(peer_count=len(out), peers=out)


@router.get("/audit-log", response_model=list[schemas.AuditLogOut])
async def get_audit_log(
    admin: models.User = Depends(require_admin_session),
    session: AsyncSession = Depends(get_session),
    limit: int = 100,
):
    result = await session.execute(
        select(models.AuditLog).order_by(models.AuditLog.created_at.desc()).limit(limit)
    )
    return result.scalars().all()
