from fastapi import APIRouter, Header, HTTPException, Request

from .. import telegram_bot

router = APIRouter(prefix="/api/telegram", tags=["telegram"])


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str = Header(default=""),
):
    # Telegram echoes back whatever secret_token we registered via
    # setWebhook on every request — without this check, anyone who finds
    # this URL could POST fake "/start" messages (harmless here, but a
    # cheap and standard check to have).
    if x_telegram_bot_api_secret_token != telegram_bot.WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="invalid webhook secret")

    update = await request.json()
    message = update.get("message")
    if message and message.get("text", "").startswith("/start"):
        chat_id = message["chat"]["id"]
        await telegram_bot.send_message(
            chat_id,
            "Welcome! Tap the button below to manage your VPN devices.",
            web_app_button_text="Open VPN app",
        )

    # Telegram only cares about the 2xx status; body content is ignored.
    return {"ok": True}
