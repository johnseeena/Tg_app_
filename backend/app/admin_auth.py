import base64
import hashlib
import hmac
import os
import time

from .config import settings

# The password the admin panel ships with. `password_hash IS NULL` in the
# DB means this is still in effect; the UI forces a change before letting
# the admin do anything.
DEFAULT_PASSWORD = "admin"
MIN_PASSWORD_LEN = 8

# scrypt work factor. 128 * N * r bytes ≈ 16 MiB of memory per hash at
# these params — deliberately expensive to slow brute force, but admin
# logins are rare so the cost is irrelevant in practice.
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_MAXMEM = 64 * 1024 * 1024


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.scrypt(
        password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32, maxmem=_SCRYPT_MAXMEM
    )
    return f"scrypt${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored_hash: str | None) -> bool:
    """Constant-time verify against the stored hash, or against the default
    password when no custom one has been set yet."""
    if stored_hash is None:
        return hmac.compare_digest(password, DEFAULT_PASSWORD)
    try:
        algo, salt_b64, dk_b64 = stored_hash.split("$")
    except ValueError:
        return False
    if algo != "scrypt":
        return False
    salt = base64.b64decode(salt_b64)
    expected = base64.b64decode(dk_b64)
    dk = hashlib.scrypt(
        password.encode(),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=len(expected),
        maxmem=_SCRYPT_MAXMEM,
    )
    return hmac.compare_digest(dk, expected)


def validate_new_password(password: str) -> str | None:
    """Returns an error message if the proposed password is unacceptable,
    else None."""
    if len(password) < MIN_PASSWORD_LEN:
        return f"password must be at least {MIN_PASSWORD_LEN} characters"
    if password == DEFAULT_PASSWORD:
        return "password must not be the default"
    return None


# --- session tokens ---------------------------------------------------------
# After a successful password login we hand the client a short-lived signed
# token to present on subsequent admin requests, so the (expensive) password
# check happens once per session rather than per request. The signing key is
# derived from the bot token AND the current password hash, so rotating the
# password instantly invalidates every outstanding session.


def _signing_key(password_hash: str | None) -> bytes:
    material = f"admin-session:{password_hash or 'default'}".encode()
    return hmac.new(settings.telegram_bot_token.encode(), material, hashlib.sha256).digest()


def issue_token(telegram_id: int, password_hash: str | None) -> str:
    exp = int(time.time()) + settings.admin_session_ttl_seconds
    payload = f"{telegram_id}:{exp}"
    sig = hmac.new(_signing_key(password_hash), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}:{sig}".encode()).decode()


def verify_token(token: str, telegram_id: int, password_hash: str | None) -> bool:
    try:
        decoded = base64.urlsafe_b64decode(token.encode()).decode()
        tid_s, exp_s, sig = decoded.split(":")
    except Exception:
        return False
    payload = f"{tid_s}:{exp_s}"
    expected = hmac.new(_signing_key(password_hash), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return False
    try:
        if int(tid_s) != telegram_id or int(exp_s) < time.time():
            return False
    except ValueError:
        return False
    return True
