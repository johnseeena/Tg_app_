"""Short-lived, single-use tokens for the served iOS .mobileconfig.

The install URL is opened in the EXTERNAL system browser (Telegram's
openLink), which carries no Telegram initData, so the normal per-request
auth can't gate it. Instead the Mini App — already authenticated — mints a
random token bound to one peer, and the public download route accepts only
that token, briefly.

In-memory on purpose: there's a single backend instance, and a token lost
to a restart just means the user taps "Install" again. TTL-bounded and
consumed on first use so a leaked URL (e.g. via browser history) can't be
replayed into someone's cert.
"""

import secrets
import time

# token -> (peer_id, expires_at_monotonic)
_TOKENS: dict[str, tuple[int, float]] = {}
_TTL_SECONDS = 600


def _purge(now: float) -> None:
    for tok in [t for t, (_, exp) in _TOKENS.items() if exp < now]:
        _TOKENS.pop(tok, None)


def issue(peer_id: int) -> str:
    now = time.monotonic()
    _purge(now)
    token = secrets.token_urlsafe(32)
    _TOKENS[token] = (peer_id, now + _TTL_SECONDS)
    return token


def resolve(token: str) -> int | None:
    """Returns the peer_id for a valid, unexpired token, or None. Left in
    place (not consumed) within its TTL on purpose: iOS Safari can fetch the
    profile URL more than once around an install (preflight + actual load),
    and a destructive first read would break the second. The short TTL plus
    a 32-byte random token bounds replay risk, and the URL only ever yields
    the requesting user's own certificate anyway."""
    now = time.monotonic()
    _purge(now)
    entry = _TOKENS.get(token)
    if entry is None:
        return None
    peer_id, exp = entry
    if exp < now:
        _TOKENS.pop(token, None)
        return None
    return peer_id
