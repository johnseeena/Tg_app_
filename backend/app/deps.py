from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import admin_auth, models
from .config import settings
from .db import get_session
from .telegram_auth import InitDataError, parse_and_verify_init_data


async def get_current_user(
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> models.User:
    if not authorization or not authorization.startswith("tma "):
        raise HTTPException(status_code=401, detail="expected header 'Authorization: tma <initData>'")

    init_data = authorization[len("tma "):]
    try:
        tg_user = parse_and_verify_init_data(
            init_data, settings.telegram_bot_token, settings.init_data_max_age_seconds
        )
    except InitDataError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    telegram_id = int(tg_user["id"])
    role = "admin" if telegram_id in settings.telegram_admin_ids else "user"

    result = await session.execute(select(models.User).where(models.User.telegram_id == telegram_id))
    user = result.scalar_one_or_none()

    if user is None:
        user = models.User(
            telegram_id=telegram_id,
            username=tg_user.get("username"),
            first_name=tg_user.get("first_name"),
            role=role,
        )
        session.add(user)
        await session.flush()
    else:
        # Keep role in sync with TELEGRAM_ADMIN_IDS in case it changed since
        # this user was first provisioned.
        if user.role != role:
            user.role = role
        if user.username != tg_user.get("username"):
            user.username = tg_user.get("username")

    if user.status == "blocked":
        raise HTTPException(status_code=403, detail="account blocked")

    return user


async def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="admin only")
    return user


async def require_admin_session(
    user: models.User = Depends(require_admin),
    x_admin_token: str = Header(default=""),
    session: AsyncSession = Depends(get_session),
) -> models.User:
    """Gate for actual admin operations: an admin telegram id AND a valid
    admin-panel session token (issued by /api/admin/auth/login after the
    password check). While the password is still the default (hash is
    NULL) every admin action is refused with 403 so the UI is forced
    through the change-password flow first."""
    row = await session.get(models.AdminAuth, 1)
    password_hash = row.password_hash if row else None

    if password_hash is None:
        raise HTTPException(status_code=403, detail="admin password must be changed from the default first")

    if not admin_auth.verify_token(x_admin_token, user.telegram_id, password_hash):
        raise HTTPException(status_code=401, detail="admin session required")

    return user
