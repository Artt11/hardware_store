"""Cart, checkout and orders (Phase 3)."""

from collections.abc import AsyncIterator
from decimal import Decimal
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.middleware import CSRF_HEADER, SESSION_TOKEN_HEADER, limiter
from app.main import app
from app.models import Cart, Inventory, Order, User
from app.seed.excel import ProductRow
from app.seed.run import product_id_for, seed_catalog

PASSWORD = "Strong-pass-2026"
SCREW, HAMMER, PAINT = product_id_for("00001"), product_id_for("00002"), product_id_for("00003")


def row(sku: str, name: str, retail: str, wholesale: str = "0") -> ProductRow:
    return ProductRow(
        row_number=4,
        sku=sku,
        name=name,
        unit_of_measure="հատ",
        category_slug="other",
        retail_price=Decimal(retail),
        wholesale_price=Decimal(wholesale),
        discount_percent=Decimal("0"),
        barcode=None,
        description=None,
        vat_applicable=True,
        is_active=True,
    )


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[httpx.AsyncClient]:
    await seed_catalog(
        db_session,
        [
            row("00001", "Պտուտակ", "1000", wholesale="800"),
            row("00002", "Մուրճ", "4500"),
            row("00003", "Ներկ", "30000"),
        ],
        image_urls={},
        default_stock=5,
    )

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


def express(**extra: Any) -> dict[str, Any]:
    return {
        "delivery_method": "express",
        "payment_method": "cash_on_delivery",
        "customer": {"name": "Աննա Սարգսյան", "phone": "+37491000001", "email": "anna@example.com"},
        "shipping_address": {"city": "Երևան", "address": "Աբովյան 1"},
        **extra,
    }


async def add(client: httpx.AsyncClient, product: Any, qty: int, token: str | None = None) -> httpx.Response:
    headers = {SESSION_TOKEN_HEADER: token} if token else {}
    return await client.put(f"/api/v1/cart/items/{product}", json={"quantity": qty}, headers=headers)


async def sign_up(client: httpx.AsyncClient, *, company: bool = False, **extra: Any) -> None:
    body: dict[str, Any] = (
        {
            "account_type": "company",
            "email": "b2b@build.am",
            "password": PASSWORD,
            "company_name": "Build LLC",
            "tax_id": "02345678",
            "contact_person": "Դավիթ",
        }
        if company
        else {
            "account_type": "individual",
            "email": "anna@example.com",
            "password": PASSWORD,
            "first_name": "Աննա",
            "last_name": "Սարգսյան",
        }
    )
    body.update(extra)
    response = await client.post("/api/v1/auth/register", json=body)
    assert response.status_code == 201, response.text


# --- Cart ---------------------------------------------------------------------------


async def test_first_guest_write_issues_a_session_token(client: httpx.AsyncClient) -> None:
    response = await add(client, SCREW, 2)

    assert response.status_code == 200
    token = response.headers[SESSION_TOKEN_HEADER]
    assert len(token) >= 40
    assert response.json()["item_count"] == 2


async def test_guests_never_share_a_cart(client: httpx.AsyncClient) -> None:
    token = (await add(client, SCREW, 2)).headers[SESSION_TOKEN_HEADER]

    mine = await client.get("/api/v1/cart", headers={SESSION_TOKEN_HEADER: token})
    anonymous = await client.get("/api/v1/cart")
    stranger = await client.get("/api/v1/cart", headers={SESSION_TOKEN_HEADER: "made-up-token"})

    assert mine.json()["item_count"] == 2
    assert anonymous.json()["items"] == []
    assert stranger.json()["items"] == []


async def test_only_the_token_hash_is_stored(client: httpx.AsyncClient, db_session: AsyncSession) -> None:
    token = (await add(client, SCREW, 1)).headers[SESSION_TOKEN_HEADER]

    stored = await db_session.scalar(select(Cart.guest_token_hash))
    assert stored is not None and stored != token and len(stored) == 64


async def test_setting_quantity_is_idempotent(client: httpx.AsyncClient) -> None:
    token = (await add(client, SCREW, 3)).headers[SESSION_TOKEN_HEADER]
    again = await add(client, SCREW, 3, token)

    assert again.json()["item_count"] == 3


async def test_cannot_add_more_than_stock(client: httpx.AsyncClient) -> None:
    response = await add(client, SCREW, 6)
    assert response.status_code == 409


async def test_unknown_product_is_not_found(client: httpx.AsyncClient) -> None:
    response = await add(client, "00000000-0000-0000-0000-000000000000", 1)
    assert response.status_code == 404


async def test_cart_totals_and_free_shipping_hint(client: httpx.AsyncClient) -> None:
    token = (await add(client, HAMMER, 2)).headers[SESSION_TOKEN_HEADER]
    cart = (await client.get("/api/v1/cart", headers={SESSION_TOKEN_HEADER: token})).json()

    assert cart["subtotal"] == "9000.00"
    assert cart["shipping_estimate"] == "2500.00"
    assert cart["amount_to_free_shipping"] == "41000.00"


async def test_guest_cart_merges_into_account_on_login(client: httpx.AsyncClient) -> None:
    await sign_up(client)
    await client.put(f"/api/v1/cart/items/{SCREW}", json={"quantity": 1})  # user's own cart
    await client.post("/api/v1/auth/logout")
    client.cookies.clear()
    token = (await add(client, SCREW, 2)).headers[SESSION_TOKEN_HEADER]
    await add(client, HAMMER, 1, token)

    await client.post(
        "/api/v1/auth/login",
        json={"email": "anna@example.com", "password": PASSWORD},
        headers={SESSION_TOKEN_HEADER: token},
    )
    cart = (await client.get("/api/v1/cart")).json()

    quantities = {i["sku"]: i["quantity"] for i in cart["items"]}
    assert quantities == {"00001": 3, "00002": 1}
    guest_after = await client.get("/api/v1/cart", headers={SESSION_TOKEN_HEADER: token})
    assert guest_after.json()["items"] == [] or guest_after.json()["item_count"] == 4


# --- Checkout -------------------------------------------------------------------------


async def test_guest_checkout_creates_order_and_decrements_stock(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    token = (await add(client, HAMMER, 2)).headers[SESSION_TOKEN_HEADER]

    response = await client.post("/api/v1/checkout", json=express(), headers={SESSION_TOKEN_HEADER: token})

    assert response.status_code == 201, response.text
    order = response.json()
    assert order["order_number"].startswith("SURO-")
    assert order["subtotal"] == "9000.00" and order["shipping_amount"] == "2500.00"
    assert order["total_amount"] == "11500.00"
    assert order["items"][0]["name_snapshot"] == "Մուրճ"
    stock = await db_session.scalar(select(Inventory.quantity_on_hand).where(Inventory.product_id == HAMMER))
    assert stock == 3
    cart = await client.get("/api/v1/cart", headers={SESSION_TOKEN_HEADER: token})
    assert cart.json()["items"] == []


async def test_free_shipping_at_threshold_and_for_pickup(client: httpx.AsyncClient) -> None:
    token = (await add(client, PAINT, 2)).headers[SESSION_TOKEN_HEADER]  # 60,000 AMD
    big = (
        await client.post("/api/v1/checkout", json=express(), headers={SESSION_TOKEN_HEADER: token})
    ).json()

    token2 = (await add(client, HAMMER, 1)).headers[SESSION_TOKEN_HEADER]
    pickup = (
        await client.post(
            "/api/v1/checkout",
            json=express(delivery_method="pickup", shipping_address=None),
            headers={SESSION_TOKEN_HEADER: token2},
        )
    ).json()

    assert big["shipping_amount"] == "0.00"
    assert pickup["shipping_amount"] == "0.00"


async def test_checkout_with_empty_cart_is_rejected(client: httpx.AsyncClient) -> None:
    assert (await client.post("/api/v1/checkout", json=express())).status_code == 400


async def test_out_of_stock_at_checkout_changes_nothing(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    token = (await add(client, HAMMER, 4)).headers[SESSION_TOKEN_HEADER]
    await db_session.execute(
        update(Inventory).where(Inventory.product_id == HAMMER).values(quantity_on_hand=2)
    )
    await db_session.commit()  # setup must survive the endpoint's rollback (shared test session)

    response = await client.post("/api/v1/checkout", json=express(), headers={SESSION_TOKEN_HEADER: token})

    assert response.status_code == 409
    shortage = response.json()["detail"]["shortages"][0]
    assert shortage["requested"] == 4 and shortage["available"] == 2
    assert await db_session.scalar(select(func.count()).select_from(Order)) == 0
    assert (
        await db_session.scalar(select(Inventory.quantity_on_hand).where(Inventory.product_id == HAMMER)) == 2
    )


async def test_express_delivery_requires_an_address(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/v1/checkout", json=express(shipping_address=None))
    assert response.status_code == 422


async def test_guest_cannot_pay_by_invoice(client: httpx.AsyncClient) -> None:
    token = (await add(client, HAMMER, 1)).headers[SESSION_TOKEN_HEADER]
    response = await client.post(
        "/api/v1/checkout", json=express(payment_method="b2b_invoice"), headers={SESSION_TOKEN_HEADER: token}
    )
    assert response.status_code == 403


async def test_individual_cannot_pay_by_invoice(client: httpx.AsyncClient) -> None:
    await sign_up(client)
    await add(client, HAMMER, 1)
    assert (
        await client.post("/api/v1/checkout", json=express(payment_method="b2b_invoice"))
    ).status_code == 403


async def test_unverified_company_cannot_pay_by_invoice(client: httpx.AsyncClient) -> None:
    await sign_up(client, company=True)
    await add(client, HAMMER, 1)
    assert (
        await client.post("/api/v1/checkout", json=express(payment_method="b2b_invoice"))
    ).status_code == 403


async def verify_company(db: AsyncSession, credit: str) -> None:
    await db.execute(
        update(User)
        .where(User.email == "b2b@build.am")
        .values(is_verified=True, credit_limit=Decimal(credit), payment_terms_days=30)
    )


async def test_verified_company_invoice_order_uses_wholesale_and_credit(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    await sign_up(client, company=True)
    await verify_company(db_session, "100000")
    await add(client, SCREW, 5)

    response = await client.post("/api/v1/checkout", json=express(payment_method="b2b_invoice"))

    assert response.status_code == 201, response.text
    order = response.json()
    assert order["order_type"] == "b2b"
    assert order["payment_status"] == "invoiced"
    assert order["payment_due_at"] is not None
    assert order["tax_id"] == "02345678"
    assert order["items"][0]["unit_price"] == "800.00"
    assert order["items"][0]["pricing_tier"] == "wholesale"


async def test_invoice_order_over_credit_limit_is_rejected(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    await sign_up(client, company=True)
    await verify_company(db_session, "5000")
    await add(client, HAMMER, 2)  # 9,000 + 2,500 shipping

    response = await client.post("/api/v1/checkout", json=express(payment_method="b2b_invoice"))

    assert response.status_code == 409
    assert response.json()["detail"]["available_credit"] == "5000.00"


# --- Orders ---------------------------------------------------------------------------


async def test_order_history_lists_only_own_orders(client: httpx.AsyncClient) -> None:
    await sign_up(client)
    await add(client, HAMMER, 1)
    placed = (await client.post("/api/v1/checkout", json=express())).json()

    history = (await client.get("/api/v1/orders")).json()
    detail = await client.get(f"/api/v1/orders/{placed['order_number']}")

    assert [o["order_number"] for o in history["items"]] == [placed["order_number"]]
    assert detail.status_code == 200
    assert detail.json()["items"][0]["quantity"] == 1


async def test_cannot_read_another_users_order(client: httpx.AsyncClient) -> None:
    token = (await add(client, HAMMER, 1)).headers[SESSION_TOKEN_HEADER]
    guest_order = (
        await client.post("/api/v1/checkout", json=express(), headers={SESSION_TOKEN_HEADER: token})
    ).json()
    await sign_up(client)

    response = await client.get(f"/api/v1/orders/{guest_order['order_number']}")

    assert response.status_code == 404


async def test_orders_require_authentication(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/orders")).status_code == 401
