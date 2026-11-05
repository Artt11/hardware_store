"""
HTTP Security Headers & Bounded Sliding-Window Rate Limiter (`backend/app/core/middleware.py`).
Fixes:
- BUG-11: Removes `'unsafe-inline'` from `script-src` for API responses and dynamically builds
  `connect-src` from `settings.CORS_ORIGINS` (including `http://localhost:3000`).
- BUG-12: Replaces unbounded `defaultdict(list)` with a bounded `TTLCache(maxsize=10000, ttl=60)`
  to prevent memory exhaustion under distributed brute-force traffic.
"""

import time
from collections import OrderedDict
from typing import List, MutableMapping, Tuple
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from fastapi import HTTPException, status

from app.core.config import settings

try:
    from cachetools import TTLCache  # type: ignore
    HAS_CACHETOOLS = True
except ImportError:
    HAS_CACHETOOLS = False


class _BoundedTTLCache(MutableMapping[Tuple[str, str], List[float]]):
    """Fallback bounded LRU+TTL store when `cachetools` is not installed."""

    def __init__(self, maxsize: int = 10000, ttl: int = 60):
        self.maxsize = maxsize
        self.ttl = ttl
        self._data: "OrderedDict[Tuple[str, str], Tuple[float, List[float]]]" = OrderedDict()

    def _evict_expired(self, now: float) -> None:
        expired_keys = [
            k for k, (expires_at, _) in self._data.items() if expires_at <= now
        ]
        for k in expired_keys:
            self._data.pop(k, None)

    def __getitem__(self, key: Tuple[str, str]) -> List[float]:
        now = time.time()
        if key in self._data:
            expires_at, val = self._data[key]
            if expires_at > now:
                self._data.move_to_end(key)
                return val
            del self._data[key]
        raise KeyError(key)

    def __setitem__(self, key: Tuple[str, str], value: List[float]) -> None:
        now = time.time()
        self._evict_expired(now)
        if key in self._data:
            self._data.move_to_end(key)
        self._data[key] = (now + self.ttl, value)
        while len(self._data) > self.maxsize:
            self._data.popitem(last=False)

    def __delitem__(self, key: Tuple[str, str]) -> None:
        del self._data[key]

    def __iter__(self):
        return iter(self._data)

    def __len__(self) -> int:
        return len(self._data)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    OWASP Top 10 Fortified HTTP Security Headers Middleware.
    """

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)

        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"

        # BUG-11 Fix: Dynamic connect-src from settings.CORS_ORIGINS + no 'unsafe-inline' in script-src on API routes
        allowed_connect = " ".join(
            sorted(set(["'self'", "http://localhost:8000", "http://127.0.0.1:8000", *settings.CORS_ORIGINS]))
        )
        is_docs_route = request.url.path in ("/docs", "/redoc", "/openapi.json")
        script_src = (
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            if is_docs_route
            else "script-src 'self'; "
        )

        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            f"{script_src}"
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https://images.unsplash.com https://fastapi.tiangolo.com; "
            f"connect-src {allowed_connect}; "
            "frame-ancestors 'none';"
        )
        return response


class RateLimiter:
    """
    Bounded Sliding-Window Rate Limiter (BUG-12 Fix).
    Uses `cachetools.TTLCache(maxsize=10000, ttl=60)` so stale IP keys are automatically
    evicted and memory usage is strictly bounded.
    """

    def __init__(self, maxsize: int = 10000, ttl: int = 60):
        self.maxsize = maxsize
        self.ttl = ttl
        if HAS_CACHETOOLS:
            self._history: MutableMapping[Tuple[str, str], List[float]] = TTLCache(
                maxsize=maxsize, ttl=ttl
            )
        else:
            self._history = _BoundedTTLCache(maxsize=maxsize, ttl=ttl)

    def check_rate_limit(
        self,
        request: Request,
        endpoint_key: str,
        max_requests: int = 5,
        window_seconds: int = 60,
    ) -> None:
        client_ip = request.client.host if request.client else "127.0.0.1"
        now = time.time()
        key = (client_ip, endpoint_key)

        existing = self._history.get(key, [])
        valid_timestamps = [t for t in existing if now - t < window_seconds]

        if len(valid_timestamps) >= max_requests:
            self._history[key] = valid_timestamps
            retry_after = max(1, int(window_seconds - (now - valid_timestamps[0])) + 1)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many attempts. Rate limit exceeded. Please retry in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

        valid_timestamps.append(now)
        self._history[key] = valid_timestamps


rate_limiter = RateLimiter(maxsize=10000, ttl=60)
