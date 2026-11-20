"""Security middleware (pure ASGI) and a bounded sliding-window rate limiter.

SecurityMiddleware
- OWASP headers on every response; JSON API routes get `default-src 'none'`
  (no 'unsafe-inline'). Only the interactive docs get a relaxed CSP, and docs are
  disabled in production. HSTS is sent in production only. Responses to requests
  carrying credentials get `Cache-Control: no-store`.
- CSRF guard on EVERY unsafe request (POST/PUT/PATCH/DELETE), with or without
  cookies: login CSRF and guest-cart writes carry no auth cookie yet are still
  attackable. The request must send `X-Requested-With` (browsers cannot add custom
  headers cross-site without a CORS preflight, which CORS rejects for unknown
  origins); an Origin header, if present, must be an allowed origin; and
  `Sec-Fetch-Site: cross-site` is refused outright. Server-to-server callers
  (future payment webhooks) need an explicit exemption here.

Rate limiting is per process: with N workers the effective limit is N x max. The
per-account lockout stored in PostgreSQL is the cross-worker brute-force defense.
"""

import ipaddress
import json
import time
from collections import deque
from collections.abc import Callable, Coroutine
from typing import Any

from cachetools import TTLCache
from fastapi import HTTPException, Request, status
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings

CSRF_HEADER = "X-Requested-With"
SESSION_TOKEN_HEADER = "X-Session-Token"  # noqa: S105 - a header name, not a secret
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
DOCS_PATHS = {"/docs", "/openapi.json", "/docs/oauth2-redirect"}
API_CSP = "default-src 'none'; frame-ancestors 'none'"
DOCS_CSP = (
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https://fastapi.tiangolo.com; frame-ancestors 'none'"
)


def security_headers(path: str, *, personal: bool = False) -> list[tuple[bytes, bytes]]:
    headers = {
        "content-security-policy": DOCS_CSP if path in DOCS_PATHS else API_CSP,
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "no-referrer",
        "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
        "cross-origin-opener-policy": "same-origin",
        "cross-origin-resource-policy": "same-origin",
    }
    if settings.is_production:
        headers["strict-transport-security"] = "max-age=31536000; includeSubDomains"
    if personal or path.startswith(f"{settings.API_V1_PREFIX}/auth"):
        headers["cache-control"] = "no-store"
    return [(k.encode(), v.encode()) for k, v in headers.items()]


class SecurityMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.auth_cookies = {settings.ACCESS_COOKIE_NAME, settings.REFRESH_COOKIE_NAME}
        self.allowed_origins = set(settings.CORS_ORIGINS)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        has_auth_cookie = bool(self.auth_cookies & request.cookies.keys())
        if request.method in UNSAFE_METHODS and not self._same_site_request(request):
            await self._reject(scope, send)
            return

        personal = has_auth_cookie or SESSION_TOKEN_HEADER.lower() in request.headers
        extra = security_headers(scope["path"], personal=personal)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                existing = {k.lower() for k, _ in message.get("headers", [])}
                message["headers"] = list(message.get("headers", [])) + [
                    (k, v) for k, v in extra if k not in existing
                ]
            await send(message)

        await self.app(scope, receive, send_with_headers)

    def _same_site_request(self, request: Request) -> bool:
        if not request.headers.get(CSRF_HEADER):
            return False
        if request.headers.get("sec-fetch-site") == "cross-site":
            return False
        origin = request.headers.get("origin")
        return not origin or origin in self.allowed_origins

    async def _reject(self, scope: Scope, send: Send) -> None:
        body = json.dumps({"detail": "CSRF check failed."}).encode()
        await send(
            {
                "type": "http.response.start",
                "status": status.HTTP_403_FORBIDDEN,
                "headers": [(b"content-type", b"application/json"), *security_headers(scope["path"])],
            }
        )
        await send({"type": "http.response.body", "body": body})


class SlidingWindowLimiter:
    """Per-key sliding window. Memory is bounded: least-recent keys are evicted.
    Not thread-safe: call it only from the event loop (see `rate_limit`)."""

    def __init__(
        self, *, max_keys: int = 10_000, ttl_seconds: int = 3600, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._hits: TTLCache[str, deque[float]] = TTLCache(maxsize=max_keys, ttl=ttl_seconds, timer=clock)
        self._clock = clock

    def __len__(self) -> int:
        return len(self._hits)

    def reset(self) -> None:
        self._hits.clear()

    def hit(self, key: str, *, max_requests: int, window_seconds: int) -> int | None:
        """Record a hit. Returns seconds to wait if over the limit, else None."""
        now = self._clock()
        hits = self._hits.get(key) or deque()
        while hits and now - hits[0] >= window_seconds:
            hits.popleft()
        if len(hits) >= max_requests:
            self._hits[key] = hits
            return max(1, int(window_seconds - (now - hits[0])) + 1)
        hits.append(now)
        self._hits[key] = hits
        return None


limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    """Peer IP, or the right-most untrusted X-Forwarded-For hop when the peer is a
    configured trusted proxy (clients cannot spoof it otherwise). IPv6 clients are
    bucketed per /64, since one host typically controls the whole /64."""
    peer = request.client.host if request.client else "unknown"
    ip = peer
    if peer in settings.TRUSTED_PROXY_IPS:
        hops = [h.strip() for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
        untrusted = [h for h in hops if h not in settings.TRUSTED_PROXY_IPS]
        if untrusted:
            ip = untrusted[-1]
    try:
        parsed = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if parsed.version == 6:
        return str(ipaddress.ip_network(f"{parsed}/64", strict=False))
    return str(parsed)


def rate_limit(
    name: str, *, max_requests: int, window_seconds: int
) -> Callable[[Request], Coroutine[Any, Any, None]]:
    """FastAPI dependency factory: limit `name` per client IP.

    Declared `async` so it runs on the event loop: the limiter's TTLCache is not
    thread-safe, and sync dependencies run concurrently in a threadpool."""

    async def dependency(request: Request) -> None:
        retry_after = limiter.hit(
            f"{name}:{client_ip(request)}", max_requests=max_requests, window_seconds=window_seconds
        )
        if retry_after is not None:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many requests. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )

    return dependency
