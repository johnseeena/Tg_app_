from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from .. import admin_auth, audit, models
from ..db import get_session
from ..deps import require_admin, require_admin_session
from ..rate_limit import rate_limit

router = APIRouter(prefix="/api/admin/auth", tags=["admin-auth"])


class LoginBody(BaseModel):
    password: str


class ChangeBody(BaseModel):
    current_password: str
    new_password: str


async def _get_row(session: AsyncSession) -> models.AdminAuth:
    row = await session.get(models.AdminAuth, 1)
    if row is None:
        # The migration seeds this, but be defensive if it's ever missing.
        row = models.AdminAuth(id=1, password_hash=None)
        session.add(row)
        await session.flush()
    return row


@router.get("/state")
async def state(
    admin: models.User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    row = await _get_row(session)
    # `password_set == false` tells the UI it's still the default and it
    # should surface the "default is admin / admin, change it now" flow.
    return {"password_set": row.password_hash is not None}


@router.get("/verify")
async def verify(_admin: models.User = Depends(require_admin_session)):
    # Cheap endpoint the frontend gate hits on load to check whether a
    # stored admin token is still valid: 200 = good, 401 = expired/invalid
    # (re-login), 403 = still on the default password (force change).
    return {"ok": True}


@router.post("/login")
async def login(
    body: LoginBody,
    admin: models.User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    # Brute-force guard, keyed off the (already-authenticated) admin's
    # telegram id: 10 attempts per 5 minutes.
    rate_limit(f"admin_login:{admin.telegram_id}", limit=10, window_seconds=300)

    row = await _get_row(session)
    if not admin_auth.verify_password(body.password, row.password_hash):
        raise HTTPException(status_code=401, detail="invalid password")

    must_change = row.password_hash is None
    token = admin_auth.issue_token(admin.telegram_id, row.password_hash)
    return {"token": token, "must_change": must_change}


@router.post("/change-password")
async def change_password(
    body: ChangeBody,
    admin: models.User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    rate_limit(f"admin_pwchange:{admin.telegram_id}", limit=10, window_seconds=300)

    row = await _get_row(session)
    if not admin_auth.verify_password(body.current_password, row.password_hash):
        raise HTTPException(status_code=401, detail="current password is incorrect")

    err = admin_auth.validate_new_password(body.new_password)
    if err:
        raise HTTPException(status_code=400, detail=err)

    row.password_hash = admin_auth.hash_password(body.new_password)
    row.updated_at = func.now()
    await audit.log(session, actor_telegram_id=admin.telegram_id, action="admin.password_change")

    # Rotating the password invalidates every old session (the signing key
    # depends on the hash), so hand back a fresh token bound to the new one.
    token = admin_auth.issue_token(admin.telegram_id, row.password_hash)
    return {"token": token}
