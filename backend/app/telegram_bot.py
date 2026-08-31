import hashlib
import hmac

import httpx

from .config import settings

API_BASE = f"https://api.telegram.org/bot{settings.telegram_bot_token}"

# Deterministically derived from the bot token (which only the server
# knows), NOT random per-process. Two reasons: (1) it survives restarts, so
# a restart doesn't leave Telegram sending a secret the new process rejects;
# (2) any instance sharing the token computes the same value, so a stray
# local/test instance re-registering the webhook can't lock the production
# instance out by installing a secret only it knows. Only hex chars, within
# Telegram's allowed secret_token charset.
WEBHOOK_SECRET = hmac.new(settings.telegram_bot_token.encode(), b"webhook-secret-v1", hashlib.sha256).hexdigest()


async def send_message(chat_id: int, text: str, web_app_button_text: str | None = None) -> None:
    payload: dict = {"chat_id": chat_id, "text": text}
    if web_app_button_text:
        payload["reply_markup"] = {
            "inline_keyboard": [[{"text": web_app_button_text, "web_app": {"url": f"https://{settings.domain}/"}}]]
        }
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(f"{API_BASE}/sendMessage", json=payload)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            # A failed notification must never break the caller's actual
            # operation (the revoke/block already happened either way).
            print(f"[telegram_bot] failed to send message to {chat_id}: {exc}")


async def set_webhook(webhook_url: str) -> None:
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(
                f"{API_BASE}/setWebhook", json={"url": webhook_url, "secret_token": WEBHOOK_SECRET}
            )
            resp.raise_for_status()
            print(f"[telegram_bot] webhook registered at {webhook_url}")
        except httpx.HTTPError as exc:
            print(f"[telegram_bot] failed to register webhook: {exc}")
