"""Real concurrency: separate connections, real commits (no shared test transaction).

These are the properties the spec calls critical: checkout never oversells under
concurrent load, and the login lockout cannot be raced past its threshold.
"""

import asyncio
from collections.abc import AsyncIterator
from decimal import Decimal

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import settings
from app.models import Inventory, Order, User, UserSession
from app.schemas.commerce import CheckoutRequest
from app.seed.excel import ProductRow
from app.seed.run import product_id_for, seed_catalog
from app.services import auth as auth_service
from app.services import cart as cart_service
from app.services import checkout as checkout_service
from app.services.auth import InvalidCredentials

PRODUCT_A, PRODUCT_B = product_id_for("90001"), product_id_for("90002")


def product(sku: str) -> ProductRow:
    return ProductRow(
        row_number=4,
        sku=sku,
        name=f"Race item {sku}",
        unit_of_measure="հատ",
        category_slug="other",
        retail_price=Decimal("1000"),
        wholesale_price=Decimal("0"),
        discount_percent=Decimal("0"),
        barcode=None,
        description=None,
        vat_applicable=True,
        is_active=True,
    )


@pytest.fixture
async def sessions(engine: AsyncEngine) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    async with engine.begin() as conn:
        tables = ", ".join(
            [
                "order_items",
                "orders",
                "cart_items",
                "carts",
                "wishlist_items",
                "inventory",
                "products",
                "categories",
                "users",
            ]
        )
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


async def guest_cart(factory: async_sessionmaker[AsyncSession], items: dict[object, int]) -> str:
    async with factory() as db:
        cart, token = await cart_service.get_or_create_cart(db, user=None, guest_token=None)
        for pid, qty in items.items():
            await cart_service.set_quantity(db, cart, pid, qty)  # type: ignore[arg-type]
        await db.commit()
    assert token is not None
    return token


def checkout_request() -> CheckoutRequest:
    return CheckoutRequest.model_validate(
        {
            "delivery_method": "pickup",
            "payment_method": "cash_on_delivery",
            "customer": {"name": "Race Tester", "phone": "+37491000000", "email": "race@example.com"},
        }
    )


async def attempt_checkout(factory: async_sessionmaker[AsyncSession], token: str) -> str:
    async with factory() as db:
        try:
            await checkout_service.place_order(db, checkout_request(), user=None, guest_token=token)
            return "ok"
        except checkout_service.OutOfStock:
            await db.rollback()
            return "out_of_stock"


async def test_concurrent_checkouts_never_oversell(sessions: async_sessionmaker[AsyncSession]) -> None:
    async with sessions() as db:
        await seed_catalog(db, [product("90001")], image_urls={}, default_stock=3)
        await db.commit()
    tokens = [await guest_cart(sessions, {PRODUCT_A: 1}) for _ in range(8)]

    results = await asyncio.gather(*(attempt_checkout(sessions, t) for t in tokens))

    async with sessions() as db:
        stock = await db.scalar(select(Inventory.quantity_on_hand).where(Inventory.product_id == PRODUCT_A))
        orders = await db.scalar(select(func.count()).select_from(Order))
    assert results.count("ok") == 3
    assert results.count("out_of_stock") == 5
    assert stock == 0
    assert orders == 3


async def test_opposite_lock_order_carts_do_not_deadlock(sessions: async_sessionmaker[AsyncSession]) -> None:
    async with sessions() as db:
        await seed_catalog(db, [product("90001"), product("90002")], image_urls={}, default_stock=10)
        await db.commit()
    first = await guest_cart(sessions, {PRODUCT_A: 1, PRODUCT_B: 1})
    second = await guest_cart(sessions, {PRODUCT_B: 1, PRODUCT_A: 1})

    results = await asyncio.wait_for(
        asyncio.gather(attempt_checkout(sessions, first), attempt_checkout(sessions, second)), timeout=10
    )

    assert results == ["ok", "ok"]


async def test_double_submitted_checkout_creates_one_order(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    async with sessions() as db:
        await seed_catalog(db, [product("90001")], image_urls={}, default_stock=10)
        await db.commit()
    token = await guest_cart(sessions, {PRODUCT_A: 2})

    async def submit() -> str:
        async with sessions() as db:
            try:
                await checkout_service.place_order(db, checkout_request(), user=None, guest_token=token)
                return "ok"
            except checkout_service.EmptyCart:
                await db.rollback()
                return "empty"

    results = await asyncio.gather(submit(), submit())

    async with sessions() as db:
        stock = await db.scalar(select(Inventory.quantity_on_hand).where(Inventory.product_id == PRODUCT_A))
    assert sorted(results) == ["empty", "ok"]
    assert stock == 8


async def test_parallel_wrong_passwords_cannot_race_past_the_lockout(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    async with sessions() as db:
        await db.execute(
            text(
                "INSERT INTO users (email, password_hash, first_name, last_name) VALUES "
                "('race@example.com', :h, 'R', 'T')"
            ),
            {"h": await auth_service.ahash_password("Correct-pass-1")},
        )
        await db.commit()

    async def guess(password: str) -> str:
        async with sessions() as db:
            try:
                await auth_service.authenticate(db, "race@example.com", password)
                return "ok"
            except InvalidCredentials:
                return "denied"

    attempts = settings.LOGIN_LOCKOUT_THRESHOLD * 2
    results = await asyncio.gather(*(guess(f"wrong-{i}-pass") for i in range(attempts)))
    after = await guess("Correct-pass-1")

    async with sessions() as db:
        user = await db.scalar(select(User).where(User.email == "race@example.com"))
    assert results.count("ok") == 0
    assert user is not None and user.locked_until is not None
    assert after == "denied"  # still locked: the correct password cannot clear a fresh lock


async def test_simultaneous_refreshes_with_one_token_both_succeed(
    sessions: async_sessionmaker[AsyncSession],
) -> None:
    """Two tabs hit /auth/refresh at the same instant with the same cookie. The row lock
    serialises them; the loser lands in the grace window instead of tripping theft
    detection and signing the customer out everywhere."""
    async with sessions() as db:
        await db.execute(
            text(
                "INSERT INTO users (email, password_hash, first_name, last_name) VALUES "
                "('tabs@example.com', 'x', 'T', 'B')"
            )
        )
        user = await db.scalar(select(User).where(User.email == "tabs@example.com"))
        assert user is not None
        session = await auth_service.start_session(db, user)
        _, refresh = auth_service.issue_tokens(user, session)

    async def rotate() -> str:
        async with sessions() as db:
            try:
                await auth_service.rotate_refresh(db, refresh)
                return "ok"
            except auth_service.InvalidSession:
                return "revoked"

    results = await asyncio.gather(*(rotate() for _ in range(4)))

    async with sessions() as db:
        remaining = await db.scalar(select(func.count()).select_from(UserSession))
    assert results == ["ok"] * 4
    assert remaining == 1
