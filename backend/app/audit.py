from sqlalchemy.ext.asyncio import AsyncSession

from . import models


async def log(
    session: AsyncSession,
    actor_telegram_id: int,
    action: str,
    target: str | None = None,
    detail: str | None = None,
) -> None:
    session.add(
        models.AuditLog(
            actor_telegram_id=actor_telegram_id,
            action=action,
            target=target,
            detail=detail,
        )
    )
    await session.flush()
