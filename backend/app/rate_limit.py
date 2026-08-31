import time
from collections import defaultdict, deque

from fastapi import HTTPException

# In-memory, single-process limiter — sufficient at ~50-user scale and the
# backend always runs as one uvicorn worker (see entrypoint.sh). Would need
# to move to Redis if the backend is ever scaled to multiple processes.
_hits: dict[str, deque[float]] = defaultdict(deque)


def rate_limit(key: str, limit: int, window_seconds: int) -> None:
    now = time.monotonic()
    bucket = _hits[key]
    while bucket and now - bucket[0] > window_seconds:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(status_code=429, detail="rate limit exceeded, try again later")
    bucket.append(now)
