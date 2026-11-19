"""Catalog listing, facets, search and autocomplete (Phase 3)."""

from collections.abc import AsyncIterator
from decimal import Decimal
from typing import Any

import httpx
import pytest
from sqlalchemy import event, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.middleware import CSRF_HEADER, limiter
from app.main import app
from app.models import Inventory, User
from app.seed.excel import ProductRow
from app.seed.run import product_id_for, seed_catalog


def row(sku: str, name: str, category: str, retail: str, **extra: Any) -> ProductRow:
    values: dict[str, Any] = {
        "row_number": 4,
        "sku": sku,
        "name": name,
        "unit_of_measure": "հատ",
        "category_slug": category,
        "retail_price": Decimal(retail),
        "wholesale_price": Decimal("0"),
        "discount_percent": Decimal("0"),
        "barcode": None,
        "description": None,
        "vat_applicable": True,
        "is_active": True,
    }
    values.update(extra)
    return ProductRow(**values)


CATALOG = [
    row("00001", "Պտուտակ 4x40", "fasteners", "150", barcode="4600000000017"),
    row("00002", "Պտուտակ 5x60", "fasteners", "220", wholesale_price=Decimal("180")),
    row("00003", "Մուրճ 500գ", "hand-tools", "4500"),
    row("00004", "Պտուտակահան PH2", "hand-tools", "1200", unit_of_measure="հավաքածու"),
    row("00005", "Ներկ սպիտակ 5լ", "paint-chemicals", "9800", unit_of_measure="տուփ"),
    row("00006", "Փակված ապրանք", "other", "0", is_active=False),
    row("00100", "100% սիլիկոն", "paint-chemicals", "1900"),
]


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[httpx.AsyncClient]:
    await seed_catalog(
        db_session, CATALOG, image_urls={"00003": "/images/products/00003.jpg"}, default_stock=10
    )
    await db_session.execute(
        update(Inventory).where(Inventory.product_id == product_id_for("00004")).values(quantity_on_hand=0)
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


async def listing(client: httpx.AsyncClient, **params: Any) -> dict[str, Any]:
    response = await client.get("/api/v1/products", params=params)
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


def skus(body: dict[str, Any]) -> list[str]:
    return [item["sku"] for item in body["items"]]


async def test_lists_only_active_products_with_pagination(client: httpx.AsyncClient) -> None:
    body = await listing(client, page_size=2, page=1, sort="sku")

    assert skus(body) == ["00001", "00002"]
    assert body["pagination"] == {"page": 1, "page_size": 2, "total_items": 6, "total_pages": 3}


async def test_page_size_is_capped(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/products", params={"page_size": 1000})
    assert response.status_code == 422


async def test_filters_by_category_and_facet_counts_ignore_own_filter(client: httpx.AsyncClient) -> None:
    body = await listing(client, category="hand-tools")

    assert sorted(skus(body)) == ["00003", "00004"]
    counts = {f["slug"]: f["count"] for f in body["facets"]["categories"]}
    assert counts["fasteners"] == 2  # still visible while hand-tools is selected
    assert counts["hand-tools"] == 2


async def test_filters_by_multiple_categories(client: httpx.AsyncClient) -> None:
    body = await listing(client, category=["hand-tools", "fasteners"])
    assert len(body["items"]) == 4


async def test_filters_by_unit_and_price_range(client: httpx.AsyncClient) -> None:
    by_unit = await listing(client, unit="տուփ")
    by_price = await listing(client, min_price="1000", max_price="5000", sort="price_asc")

    assert skus(by_unit) == ["00005"]
    assert skus(by_price) == ["00004", "00100", "00003"]
    assert by_price["facets"]["price_range"] == {"min": "150.00", "max": "9800.00"}


async def test_in_stock_filter_hides_sold_out_products(client: httpx.AsyncClient) -> None:
    body = await listing(client, in_stock="true")
    assert "00004" not in skus(body)


async def test_items_expose_stock_category_and_image(client: httpx.AsyncClient) -> None:
    body = await listing(client, q="Մուրճ")
    item = body["items"][0]

    assert item["category"] == {"slug": "hand-tools", "name": "Ձեռքի գործիքներ"}
    assert item["in_stock"] is True
    assert item["image_url"] == "/images/products/00003.jpg"
    assert item["price"] == "4500.00"
    assert item["pricing_tier"] == "retail"


async def test_search_is_case_insensitive_for_armenian(client: httpx.AsyncClient) -> None:
    body = await listing(client, q="պտուտակ")
    assert sorted(skus(body)) == ["00001", "00002", "00004"]


async def test_exact_sku_and_barcode_match_rank_first(client: httpx.AsyncClient) -> None:
    by_sku = await listing(client, q="00002")
    by_barcode = await listing(client, q="4600000000017")

    assert skus(by_sku)[0] == "00002"
    assert skus(by_barcode) == ["00001"]


async def test_search_tolerates_typos(client: httpx.AsyncClient) -> None:
    body = await listing(client, q="Պտուտկ")  # missing letter
    assert "00001" in skus(body)


async def test_like_wildcards_in_query_are_literal(client: httpx.AsyncClient) -> None:
    body = await listing(client, q="100%")
    assert skus(body) == ["00100"]


async def register_company(client: httpx.AsyncClient) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={
            "account_type": "company",
            "email": "b2b@build.am",
            "password": "Strong-pass-2026",
            "company_name": "Build LLC",
            "tax_id": "02345678",
            "contact_person": "Դավիթ",
        },
    )


async def test_unverified_company_sees_retail_price(client: httpx.AsyncClient) -> None:
    await register_company(client)

    item = (await listing(client, q="Պտուտակ 5x60"))["items"][0]

    assert item["price"] == "220.00"
    assert item["pricing_tier"] == "retail"


async def test_verified_company_sees_wholesale_price(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    await register_company(client)
    await db_session.execute(update(User).where(User.email == "b2b@build.am").values(is_verified=True))

    item = (await listing(client, q="Պտուտակ 5x60"))["items"][0]

    assert item["price"] == "180.00"
    assert item["pricing_tier"] == "wholesale"
    assert item["retail_price"] == "220.00"


async def test_product_detail_by_slug(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/products/p-00001")

    assert response.status_code == 200
    assert response.json()["barcode"] == "4600000000017"


async def test_inactive_product_detail_is_not_found(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/v1/products/p-00006")).status_code == 404


async def test_categories_endpoint_counts_active_products(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/categories")

    counts = {c["slug"]: c["product_count"] for c in response.json()}
    assert counts["fasteners"] == 2
    assert counts["other"] == 0


async def test_autocomplete_limits_results_and_escapes_highlight(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/v1/search/autocomplete", params={"q": "պտուտակ", "limit": 2})

    body = response.json()
    assert len(body["products"]) == 2
    assert "<mark" in body["products"][0]["highlight"]


async def test_listing_query_count_does_not_grow_with_page_size(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    statements: list[str] = []

    def count(*args: Any, **kwargs: Any) -> None:
        statements.append(args[2])

    sync_engine = db_session.bind.engine.sync_engine  # type: ignore[union-attr]
    event.listen(sync_engine, "before_cursor_execute", count)
    try:
        await listing(client, page_size=1)
        small = len(statements)
        statements.clear()
        await listing(client, page_size=100)
        large = len(statements)
    finally:
        event.remove(sync_engine, "before_cursor_execute", count)

    assert small == large
    assert large <= 6
