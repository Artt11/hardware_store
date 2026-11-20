"""Regression tests for audit findings C1, C2 and R3 (see tasks/audit.md)."""

from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest

from app.core.database import get_db_session
from app.core.middleware import CSRF_HEADER, limiter
from app.main import app
from app.services.catalog import highlight as highlight_match


class _EmptyResult:
    def scalar_one_or_none(self) -> None:
        return None

    def scalars(self) -> "_EmptyResult":
        return self

    def all(self) -> list[Any]:
        return []

    def first(self) -> None:
        return None


class _RecordingSession:
    """Fake AsyncSession with no users in it that records every object added."""

    def __init__(self) -> None:
        self.added: list[Any] = []

    async def execute(self, *_args: Any, **_kwargs: Any) -> _EmptyResult:
        return _EmptyResult()

    async def scalar(self, *_args: Any, **_kwargs: Any) -> None:
        return None

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    def add_all(self, objs: list[Any]) -> None:
        self.added.extend(objs)

    async def commit(self) -> None:
        return None

    async def rollback(self) -> None:
        return None


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    limiter.reset()  # the login rate limit is process-wide; isolate from other tests
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test", headers={CSRF_HEADER: "suro"}
    ) as c:
        yield c
    app.dependency_overrides.clear()


# C1 ---------------------------------------------------------------------------


async def test_login_never_creates_accounts(client: httpx.AsyncClient) -> None:
    session = _RecordingSession()

    async def override() -> AsyncIterator[_RecordingSession]:
        yield session

    app.dependency_overrides[get_db_session] = override

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "not-a-real-password"},
    )

    assert response.status_code == 401
    assert session.added == []


async def test_login_without_csrf_header_is_rejected(client: httpx.AsyncClient) -> None:
    """Login CSRF (audit H5): a cross-site form could otherwise sign the victim into
    the attacker's account. No cookie is present yet, and the guard must still apply."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "not-a-real-password"},
        headers={CSRF_HEADER: ""},
    )
    assert response.status_code == 403
    assert response.json() == {"detail": "CSRF check failed."}


async def test_guest_cart_write_without_csrf_header_is_rejected(client: httpx.AsyncClient) -> None:
    response = await client.put(
        "/api/v1/cart/items/00000000-0000-0000-0000-000000000000",
        json={"quantity": 1},
        headers={CSRF_HEADER: "", "X-Session-Token": "guest-token"},
    )
    assert response.status_code == 403


# C2 ---------------------------------------------------------------------------


async def test_health_does_not_expose_connection_string(client: httpx.AsyncClient) -> None:
    response = await client.get("/health")

    assert "dsn" not in response.json()
    assert "postgresql" not in response.text


async def test_health_reports_503_when_database_is_unreachable(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def unreachable() -> bool:
        return False

    monkeypatch.setattr("app.main.ping_database", unreachable)

    response = await client.get("/health")

    assert response.status_code == 503
    assert response.json()["database"] == "unavailable"


# R3 ---------------------------------------------------------------------------


def test_highlight_escapes_html_in_product_names() -> None:
    result = highlight_match("<img src=x onerror=alert(1)> Drill", "drill")

    assert "<img" not in result
    assert "&lt;img src=x onerror=alert(1)&gt;" in result
    assert "<mark class='bg-neutral-200 font-semibold'>Drill</mark>" in result


def test_highlight_escapes_names_without_a_match() -> None:
    assert highlight_match("<b>Hammer</b>", "") == "&lt;b&gt;Hammer&lt;/b&gt;"
