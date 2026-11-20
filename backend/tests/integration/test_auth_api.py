"""Auth API against the real test database (Phase 2c)."""

from collections.abc import AsyncIterator
from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db_session
from app.core.middleware import CSRF_HEADER, limiter
from app.core.security import create_token
from app.main import app
from app.models import User

PASSWORD = "Strong-pass-2026"
ACCESS = settings.ACCESS_COOKIE_NAME
REFRESH = settings.REFRESH_COOKIE_NAME


def individual(email: str = "anna@example.com", **extra: Any) -> dict[str, Any]:
    return {
        "account_type": "individual",
        "email": email,
        "password": PASSWORD,
        "first_name": "Աննա",
        "last_name": "Սարգսյան",
        **extra,
    }


def company(**extra: Any) -> dict[str, Any]:
    return {
        "account_type": "company",
        "email": "buyer@build.am",
        "password": PASSWORD,
        "company_name": "Build LLC",
        "tax_id": "02345678",
        "contact_person": "Դավիթ",
        **extra,
    }


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[httpx.AsyncClient]:
    async def override() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_db_session] = override
    limiter.reset()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test", headers={CSRF_HEADER: "suro"}
    ) as c:
        yield c
    app.dependency_overrides.clear()


async def register(client: httpx.AsyncClient, body: dict[str, Any]) -> httpx.Response:
    return await client.post("/api/v1/auth/register", json=body)


async def test_register_sets_httponly_cookies_and_returns_no_tokens(client: httpx.AsyncClient) -> None:
    response = await register(client, individual())

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "anna@example.com"
    assert body["account_type"] == "individual"
    assert "access_token" not in response.text and "password" not in response.text
    set_cookie = response.headers.get_list("set-cookie")
    access = next(c for c in set_cookie if c.startswith(f"{ACCESS}="))
    refresh = next(c for c in set_cookie if c.startswith(f"{REFRESH}="))
    assert "HttpOnly" in access and "SameSite=lax" in access and "Path=/api" in access
    assert "HttpOnly" in refresh and "Path=/api/v1/auth" in refresh


@pytest.mark.parametrize("tax_id", ["1234567", "123456789", "12A45678", "٠١٢٣٤٥٦٧"])
async def test_company_registration_requires_eight_digit_hvhh(client: httpx.AsyncClient, tax_id: str) -> None:
    response = await register(client, company(tax_id=tax_id))
    assert response.status_code == 422


async def test_company_registration_requires_company_fields(client: httpx.AsyncClient) -> None:
    response = await register(client, company(company_name="  "))
    assert response.status_code == 422


async def test_company_registration_creates_b2b_account(client: httpx.AsyncClient) -> None:
    response = await register(client, company())
    assert response.status_code == 201
    assert response.json()["account_type"] == "company"
    assert response.json()["tax_id"] == "02345678"


async def test_duplicate_email_is_rejected_case_insensitively(client: httpx.AsyncClient) -> None:
    await register(client, individual("anna@example.com"))
    response = await register(client, individual("ANNA@Example.com"))
    assert response.status_code == 409


async def test_password_longer_than_bcrypt_limit_is_rejected(client: httpx.AsyncClient) -> None:
    response = await register(client, individual(password="Ա1" * 30))  # 90 bytes in UTF-8
    assert response.status_code == 422


async def test_login_errors_do_not_reveal_whether_email_exists(client: httpx.AsyncClient) -> None:
    await register(client, individual())
    client.cookies.clear()

    wrong_password = await client.post(
        "/api/v1/auth/login", json={"email": "anna@example.com", "password": "nope-nope-1"}
    )
    unknown_email = await client.post(
        "/api/v1/auth/login", json={"email": "ghost@example.com", "password": "nope-nope-1"}
    )

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


async def test_login_then_me(client: httpx.AsyncClient) -> None:
    await register(client, individual())
    client.cookies.clear()

    login = await client.post("/api/v1/auth/login", json={"email": "Anna@Example.com", "password": PASSWORD})
    me = await client.get("/api/v1/auth/me")

    assert login.status_code == 200
    assert me.status_code == 200
    assert me.json()["email"] == "anna@example.com"


async def test_me_requires_authentication(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_account_locks_after_repeated_failures(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    await register(client, individual())
    client.cookies.clear()
    for _ in range(settings.LOGIN_LOCKOUT_THRESHOLD):
        limiter.reset()
        await client.post(
            "/api/v1/auth/login", json={"email": "anna@example.com", "password": "wrong-pass-1"}
        )
    limiter.reset()

    response = await client.post(
        "/api/v1/auth/login", json={"email": "anna@example.com", "password": PASSWORD}
    )

    # Locked accounts get the same answer as bad credentials (no enumeration of locked accounts).
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid email or password."}
    user = await db_session.scalar(select(User).where(User.email == "anna@example.com"))
    assert user is not None
    await db_session.refresh(user)
    assert user.locked_until is not None


async def test_refresh_token_reuse_revokes_all_sessions(client: httpx.AsyncClient) -> None:
    await register(client, individual())
    stolen = client.cookies.get(REFRESH) or ""
    assert (await client.post("/api/v1/auth/refresh")).status_code == 200  # legitimate rotation

    client.cookies.clear()
    client.cookies.set(REFRESH, stolen, path="/api/v1/auth")
    replay = await client.post("/api/v1/auth/refresh")

    assert replay.status_code == 401


async def test_validation_errors_never_echo_the_password(client: httpx.AsyncClient) -> None:
    response = await register(client, individual(password="short1"))

    assert response.status_code == 422
    assert "short1" not in response.text


async def test_duplicate_auth_cookies_are_rejected(client: httpx.AsyncClient) -> None:
    await register(client, individual())
    token = client.cookies.get(ACCESS) or ""
    client.cookies.clear()

    response = await client.get("/api/v1/auth/me", headers={"cookie": f"{ACCESS}=planted; {ACCESS}={token}"})

    assert response.status_code == 401


async def test_logout_revokes_existing_tokens_immediately(client: httpx.AsyncClient) -> None:
    await register(client, individual())
    old_access = client.cookies.get(ACCESS)
    old_refresh = client.cookies.get(REFRESH)

    assert (await client.post("/api/v1/auth/logout")).status_code == 204

    client.cookies.clear()
    client.cookies.set(ACCESS, old_access or "")
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    client.cookies.clear()
    client.cookies.set(REFRESH, old_refresh or "", path="/api/v1/auth")
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


async def test_deactivated_user_is_rejected_on_next_request(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    await register(client, individual())
    await db_session.execute(update(User).where(User.email == "anna@example.com").values(is_active=False))

    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_refresh_rotates_tokens(client: httpx.AsyncClient) -> None:
    await register(client, individual())
    old_access = client.cookies.get(ACCESS)

    response = await client.post("/api/v1/auth/refresh")

    assert response.status_code == 200
    assert client.cookies.get(ACCESS) != old_access
    assert (await client.get("/api/v1/auth/me")).status_code == 200


async def test_access_token_cannot_be_used_as_refresh_token(client: httpx.AsyncClient) -> None:
    await register(client, individual())
    access = client.cookies.get(ACCESS) or ""
    client.cookies.clear()
    client.cookies.set(REFRESH, access, path="/api/v1/auth")

    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


async def test_successful_login_resets_failure_counter(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    await register(client, individual())
    client.cookies.clear()
    await client.post("/api/v1/auth/login", json={"email": "anna@example.com", "password": "wrong-pass-1"})
    await client.post("/api/v1/auth/login", json={"email": "anna@example.com", "password": PASSWORD})

    user = await db_session.scalar(select(User).where(User.email == "anna@example.com"))
    assert user is not None
    await db_session.refresh(user)
    assert user.failed_login_attempts == 0
    assert user.last_login_at is not None


async def test_login_is_rate_limited(client: httpx.AsyncClient) -> None:
    codes = [
        (
            await client.post(
                "/api/v1/auth/login", json={"email": "x@example.com", "password": "nope-nope-1"}
            )
        ).status_code
        for _ in range(settings.RATE_LIMIT_LOGIN_MAX + 1)
    ]
    assert codes[-1] == 429


# --- Audit C1: expired access token must not silently downgrade to guest ---------------


async def test_access_cookie_outlives_the_access_token(client: httpx.AsyncClient) -> None:
    response = await register(client, individual())

    access = next(c for c in response.headers.get_list("set-cookie") if c.startswith(f"{ACCESS}="))
    refresh_seconds = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400
    assert f"Max-Age={refresh_seconds}" in access


async def test_expired_access_token_on_optional_route_is_401_not_guest(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    await register(client, individual())
    user = await db_session.scalar(select(User).where(User.email == "anna@example.com"))
    assert user is not None
    expired = create_token(user.id, token_version=user.token_version, kind="access", lifetime=timedelta(seconds=-5))
    client.cookies.set(ACCESS, expired)

    for path in ("/api/v1/cart", "/api/v1/products"):
        assert (await client.get(path)).status_code == 401, path
