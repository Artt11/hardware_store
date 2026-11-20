"""Security headers, CSRF guard and rate limiter (Phase 2b)."""

from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import Depends, FastAPI, Request

from app.core.config import settings
from app.core.middleware import (
    CSRF_HEADER,
    SecurityMiddleware,
    SlidingWindowLimiter,
    client_ip,
    rate_limit,
)


def build_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(SecurityMiddleware)

    @app.get("/api/v1/thing")
    async def read() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/api/v1/thing")
    async def write() -> dict[str, bool]:
        return {"ok": True}

    @app.post(
        "/api/v1/limited", dependencies=[Depends(rate_limit("test", max_requests=2, window_seconds=60))]
    )
    async def limited() -> dict[str, bool]:
        return {"ok": True}

    return app


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=build_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_api_responses_carry_strict_security_headers(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/thing")

    assert response.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "unsafe-inline" not in response.headers["content-security-policy"]


async def test_hsts_is_not_sent_outside_production(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/thing")
    assert "strict-transport-security" not in response.headers


async def test_unsafe_request_with_auth_cookie_needs_csrf_header(client: httpx.AsyncClient) -> None:
    client.cookies.set(settings.ACCESS_COOKIE_NAME, "token")

    blocked = await client.post("/api/v1/thing")
    allowed = await client.post("/api/v1/thing", headers={CSRF_HEADER: "suro"})

    assert blocked.status_code == 403
    assert allowed.status_code == 200


async def test_unsafe_request_from_foreign_origin_is_blocked(client: httpx.AsyncClient) -> None:
    client.cookies.set(settings.ACCESS_COOKIE_NAME, "token")

    response = await client.post(
        "/api/v1/thing", headers={CSRF_HEADER: "suro", "Origin": "https://evil.example"}
    )

    assert response.status_code == 403


async def test_unsafe_request_without_cookies_still_needs_csrf_header(client: httpx.AsyncClient) -> None:
    """Login CSRF and guest-cart writes carry no auth cookie, so the guard must not
    depend on one (audit H5)."""
    assert (await client.post("/api/v1/thing")).status_code == 403
    assert (await client.post("/api/v1/thing", headers={CSRF_HEADER: "suro"})).status_code == 200


async def test_cookieless_request_from_foreign_origin_is_blocked(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/v1/thing", headers={CSRF_HEADER: "suro", "Origin": "https://evil.example"}
    )
    assert response.status_code == 403


async def test_cross_site_fetch_metadata_is_blocked(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/v1/thing", headers={CSRF_HEADER: "suro", "Sec-Fetch-Site": "cross-site"}
    )
    assert response.status_code == 403


async def test_allowed_origin_passes(client: httpx.AsyncClient) -> None:
    origin = settings.CORS_ORIGINS[0]
    response = await client.post("/api/v1/thing", headers={CSRF_HEADER: "suro", "Origin": origin})
    assert response.status_code == 200


async def test_safe_request_with_cookie_is_not_csrf_checked(client: httpx.AsyncClient) -> None:
    client.cookies.set(settings.ACCESS_COOKIE_NAME, "token")
    assert (await client.get("/api/v1/thing")).status_code == 200


async def test_rate_limit_dependency_returns_429_with_retry_after(client: httpx.AsyncClient) -> None:
    codes = [
        (await client.post("/api/v1/limited", headers={CSRF_HEADER: "suro"})).status_code for _ in range(3)
    ]

    assert codes == [200, 200, 429]
    blocked = await client.post("/api/v1/limited", headers={CSRF_HEADER: "suro"})
    assert int(blocked.headers["retry-after"]) >= 1


def test_sliding_window_forgets_old_hits() -> None:
    now = [1000.0]
    limiter = SlidingWindowLimiter(clock=lambda: now[0])

    assert limiter.hit("k", max_requests=1, window_seconds=10) is None
    assert limiter.hit("k", max_requests=1, window_seconds=10) is not None
    now[0] += 11
    assert limiter.hit("k", max_requests=1, window_seconds=10) is None


def test_sliding_window_memory_is_bounded() -> None:
    limiter = SlidingWindowLimiter(max_keys=100)
    for i in range(1_000):
        limiter.hit(f"ip-{i}", max_requests=5, window_seconds=60)
    assert len(limiter) <= 100


async def test_requests_with_credentials_are_marked_no_store(client: httpx.AsyncClient) -> None:
    anonymous = await client.get("/api/v1/thing")
    client.cookies.set(settings.ACCESS_COOKIE_NAME, "token")
    personal = await client.get("/api/v1/thing")

    assert "cache-control" not in anonymous.headers
    assert personal.headers["cache-control"] == "no-store"


def _request(peer: str, forwarded: str | None = None) -> Request:
    headers = [(b"x-forwarded-for", forwarded.encode())] if forwarded else []
    return Request({"type": "http", "client": (peer, 1234), "headers": headers, "method": "GET", "path": "/"})


def test_forwarded_for_is_ignored_from_untrusted_peers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "TRUSTED_PROXY_IPS", ["10.0.0.1"])
    assert client_ip(_request("203.0.113.9", forwarded="1.2.3.4")) == "203.0.113.9"


def test_forwarded_for_is_used_behind_trusted_proxy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "TRUSTED_PROXY_IPS", ["10.0.0.1"])
    # Left-most entries are client-controlled; the right-most untrusted hop is the real client.
    assert client_ip(_request("10.0.0.1", forwarded="6.6.6.6, 198.51.100.7")) == "198.51.100.7"


def test_ipv6_clients_share_a_bucket_per_64() -> None:
    a = client_ip(_request("2001:db8:1:2::1"))
    b = client_ip(_request("2001:db8:1:2:ffff::9"))
    assert a == b == "2001:db8:1:2::/64"
