import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl


class InitDataError(Exception):
    pass


def parse_and_verify_init_data(init_data: str, bot_token: str, max_age_seconds: int) -> dict:
    """Verify Telegram WebApp initData per the official algorithm:
    https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

    secret_key = HMAC_SHA256(key=b"WebAppData", msg=bot_token)
    hash        = HMAC_SHA256(key=secret_key,   msg=data_check_string)
    """
    try:
        pairs = parse_qsl(init_data, strict_parsing=True)
    except ValueError as exc:
        raise InitDataError("malformed init data") from exc

    data = dict(pairs)
    received_hash = data.pop("hash", None)
    if not received_hash:
        raise InitDataError("missing hash field")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        raise InitDataError("signature mismatch")

    try:
        auth_date = int(data.get("auth_date", "0"))
    except ValueError as exc:
        raise InitDataError("invalid auth_date") from exc

    if auth_date <= 0 or time.time() - auth_date > max_age_seconds:
        raise InitDataError("init data expired")

    user_raw = data.get("user")
    if not user_raw:
        raise InitDataError("missing user field")

    try:
        user = json.loads(user_raw)
    except json.JSONDecodeError as exc:
        raise InitDataError("malformed user field") from exc

    if "id" not in user:
        raise InitDataError("user field missing id")

    return user
