import base64
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .. import audit, ikev2_manager, ios_tokens, models, schemas
from ..config import settings
from ..db import get_session
from ..deps import get_current_user
from ..rate_limit import rate_limit

router = APIRouter(prefix="/api/peers", tags=["peers"])


@router.get("", response_model=list[schemas.PeerOut])
async def list_my_peers(
    user: models.User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(models.Peer).where(models.Peer.user_id == user.id, models.Peer.revoked_at.is_(None))
    )
    return result.scalars().all()


@router.post("", response_model=schemas.PeerOut, status_code=201)
async def create_peer(
    body: schemas.PeerCreate,
    user: models.User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    rate_limit(f"peer_create:{user.telegram_id}", limit=10, window_seconds=3600)

    count_result = await session.execute(
        select(func.count())
        .select_from(models.Peer)
        .where(models.Peer.user_id == user.id, models.Peer.revoked_at.is_(None))
    )
    if count_result.scalar_one() >= settings.max_devices_per_user:
        raise HTTPException(
            status_code=429, detail=f"device limit reached ({settings.max_devices_per_user})"
        )

    # DB insert happens BEFORE the cert is issued, same insert-first
    # ordering as the rest of this app: the DB is the source of truth and
    # the NSS-mutating call is a follow-up side effect, not the other way
    # around (see peer revoke / enforcement, which follow the same shape).
    peer = models.Peer(
        user_id=user.id,
        name=body.name,
        client_uuid=uuid.uuid4().hex,
    )
    session.add(peer)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="allocation conflict, please retry")

    try:
        await ikev2_manager.issue_client_cert(peer.client_uuid)
    except ikev2_manager.VpnCommandError:
        await session.delete(peer)
        await session.flush()
        raise

    await audit.log(session, actor_telegram_id=user.telegram_id, action="peer.create", target=str(peer.id), detail=peer.name)

    return peer


@router.get("/{peer_id}/cert", response_model=schemas.PeerCertOut)
async def get_peer_cert(
    peer_id: int,
    user: models.User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Re-exports the client's .p12 from the NSS database on demand — the
    private key never leaves that database except inside this (still
    password-empty-but-transport-encrypted-via-HTTPS) bundle, and only in
    response to the device's own owner explicitly asking to see it again.
    Not part of the bulk peer list for that reason."""
    peer = await session.get(models.Peer, peer_id)
    if peer is None or peer.user_id != user.id or peer.revoked_at is not None:
        raise HTTPException(status_code=404, detail="peer not found")

    cert_bytes = await ikev2_manager.export_client_cert(peer.client_uuid)
    return schemas.PeerCertOut(client_uuid=peer.client_uuid, cert_base64=base64.b64encode(cert_bytes).decode())


@router.post("/{peer_id}/ios-profile-token", response_model=schemas.IosProfileToken)
async def create_ios_profile_token(
    peer_id: int,
    user: models.User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Mints a short-lived token so the served .mobileconfig (GET
    /api/ios-profile/{token}, defined in main.py) can be opened in the
    EXTERNAL browser — which carries no Telegram initData, so it can't use
    the normal per-request auth. Ownership is checked HERE, while we still
    have the authenticated user; the download route then trusts the token."""
    peer = await session.get(models.Peer, peer_id)
    if peer is None or peer.user_id != user.id or peer.revoked_at is not None:
        raise HTTPException(status_code=404, detail="peer not found")
    return schemas.IosProfileToken(token=ios_tokens.issue(peer.id))


@router.delete("/{peer_id}", status_code=204)
async def revoke_peer(
    peer_id: int,
    user: models.User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    peer = await session.get(models.Peer, peer_id)
    if peer is None or peer.user_id != user.id or peer.revoked_at is not None:
        raise HTTPException(status_code=404, detail="peer not found")

    await ikev2_manager.delete_client_cert(peer.client_uuid)
    peer.revoked_at = func.now()
    await audit.log(session, actor_telegram_id=user.telegram_id, action="peer.revoke", target=str(peer.id))
