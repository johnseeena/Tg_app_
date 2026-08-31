import asyncio
import base64
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from . import android_profile, enforcement, ikev2_manager, ios_profile, ios_tokens, models, telegram_bot
from .config import settings
from .db import SessionLocal, get_session
from .deps import get_current_user
from .reconcile import reconcile_all_peers
from .routers import admin, admin_auth, peers, server, telegram_webhook


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with SessionLocal() as session:
        count = await reconcile_all_peers(session)
        await session.commit()
        print(f"[startup] checked {count} active peer(s) against the NSS cert database")

    if settings.domain:
        await telegram_bot.set_webhook(f"https://{settings.domain}/api/telegram/webhook")

    enforcement_task = asyncio.create_task(enforcement.run_forever())
    yield
    enforcement_task.cancel()


app = FastAPI(title="amnezia-tg-app backend", lifespan=lifespan)


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/api/healthz")
def api_healthz():
    return {"status": "ok"}


@app.get("/api/auth/me")
async def me(user: models.User = Depends(get_current_user)):
    return {"telegram_id": user.telegram_id, "role": user.role, "username": user.username}


@app.get("/api/ios-profile/{token}")
async def ios_profile_download(token: str, session: AsyncSession = Depends(get_session)):
    """Serves the iOS Configuration Profile as a real HTTPS response with the
    Content-Type that makes Safari offer to install it — the only delivery
    iOS actually accepts (a blob: URL built in-page does not). Deliberately
    unauthenticated: it's opened in the external browser with no initData,
    and is gated instead by the short-lived, ownership-bound token minted at
    POST /api/peers/{id}/ios-profile-token."""
    peer_id = ios_tokens.resolve(token)
    if peer_id is None:
        raise HTTPException(status_code=404, detail="expired or invalid link")
    peer = await session.get(models.Peer, peer_id)
    if peer is None or peer.revoked_at is not None:
        raise HTTPException(status_code=404, detail="peer not found")

    cert_bytes = await ikev2_manager.export_client_cert(peer.client_uuid)
    # iOS can't decrypt pk12util's modern PBES2/AES p12 (it reports a wrong
    # password on install), so hand it the legacy-encoded variant.
    cert_bytes = await ikev2_manager.reencode_p12_legacy(cert_bytes)
    xml = ios_profile.build_mobileconfig(
        endpoint_host=settings.vpn_endpoint_host,
        ca_cert_base64=ikev2_manager.get_ca_cert_base64(),
        client_uuid=peer.client_uuid,
        cert_base64=base64.b64encode(cert_bytes).decode(),
        remark_raw=peer.name,
    )
    return Response(
        content=xml,
        media_type="application/x-apple-aspen-config",
        headers={"Content-Disposition": 'attachment; filename="ikev2-vpn.mobileconfig"'},
    )


@app.get("/api/android-profile/{token}")
async def android_profile_download(token: str, session: AsyncSession = Depends(get_session)):
    """Serves the strongSwan .sswan profile as a real download.

    Replaces stuffing the whole profile into the URL #fragment: with the
    PKCS#12 embedded it's ~6.5 KB, and some Android browsers/ROMs silently
    truncate long URLs, so strongSwan received a cut-off file and failed with
    "Unterminated string at character NNNN" (seen on a real device). Same
    token gate as the iOS route — see POST /api/peers/{id}/ios-profile-token,
    whose token is format-agnostic (it only binds a peer)."""
    peer_id = ios_tokens.resolve(token)
    if peer_id is None:
        raise HTTPException(status_code=404, detail="expired or invalid link")
    peer = await session.get(models.Peer, peer_id)
    if peer is None or peer.revoked_at is not None:
        raise HTTPException(status_code=404, detail="peer not found")

    cert_bytes = await ikev2_manager.export_client_cert(peer.client_uuid)
    profile = android_profile.build_sswan(
        endpoint_host=settings.vpn_endpoint_host,
        cert_base64=base64.b64encode(cert_bytes).decode(),
        remark=peer.name,
    )
    return Response(
        content=profile,
        media_type="application/vnd.strongswan.profile",
        headers={"Content-Disposition": 'attachment; filename="ikev2-vpn.sswan"'},
    )


app.include_router(peers.router)
app.include_router(admin.router)
app.include_router(admin_auth.router)
app.include_router(server.router)
app.include_router(telegram_webhook.router)
