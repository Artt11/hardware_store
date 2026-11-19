"""Phase 1, Task 7: seeding writes the parsed catalog idempotently."""

from decimal import Decimal

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, Inventory, Product, User
from app.seed.categories import ALL_CATEGORIES
from app.seed.excel import ProductRow
from app.seed.run import DemoUsersRefused, product_id_for, seed_catalog, seed_demo_users


def make_row(sku: str, **overrides: object) -> ProductRow:
    values: dict[str, object] = {
        "row_number": 4,
        "sku": sku,
        "name": f"Պտուտակ {sku}",
        "unit_of_measure": "հատ",
        "category_slug": "fasteners",
        "retail_price": Decimal("150.00"),
        "wholesale_price": Decimal("0.00"),
        "discount_percent": Decimal("0.00"),
        "barcode": None,
        "description": None,
        "vat_applicable": True,
        "is_active": True,
    }
    values.update(overrides)
    return ProductRow(**values)  # type: ignore[arg-type]


async def counts(db: AsyncSession) -> tuple[int, int, int]:
    return (
        await db.scalar(select(func.count()).select_from(Category)) or 0,
        await db.scalar(select(func.count()).select_from(Product)) or 0,
        await db.scalar(select(func.count()).select_from(Inventory)) or 0,
    )


async def test_seeds_categories_products_and_inventory(db_session: AsyncSession) -> None:
    rows = [make_row("00001"), make_row("00002")]

    await seed_catalog(db_session, rows, image_urls={"00001": "/images/products/00001.jpg"}, default_stock=40)

    assert await counts(db_session) == (len(ALL_CATEGORIES), 2, 2)
    product = await db_session.scalar(select(Product).where(Product.sku == "00001"))
    assert product is not None
    assert product.id == product_id_for("00001")
    assert product.image_url == "/images/products/00001.jpg"
    assert product.slug == "p-00001"
    stock = await db_session.scalar(
        select(Inventory.quantity_on_hand).where(Inventory.product_id == product.id)
    )
    assert stock == 40


async def test_running_twice_creates_no_duplicates(db_session: AsyncSession) -> None:
    rows = [make_row("00001"), make_row("00002")]

    await seed_catalog(db_session, rows, image_urls={}, default_stock=40)
    first = await counts(db_session)
    await seed_catalog(db_session, rows, image_urls={}, default_stock=40)

    assert await counts(db_session) == first


async def test_reseeding_updates_catalog_but_never_resets_stock(db_session: AsyncSession) -> None:
    await seed_catalog(db_session, [make_row("00001")], image_urls={}, default_stock=40)
    # Simulate sales after the first import.
    await db_session.execute(
        update(Inventory).where(Inventory.product_id == product_id_for("00001")).values(quantity_on_hand=3)
    )

    await seed_catalog(
        db_session, [make_row("00001", retail_price=Decimal("175.00"))], image_urls={}, default_stock=40
    )

    product = await db_session.scalar(select(Product).where(Product.sku == "00001"))
    assert product is not None and product.retail_price == Decimal("175.00")
    stock = await db_session.scalar(
        select(Inventory.quantity_on_hand).where(Inventory.product_id == product.id)
    )
    assert stock == 3


async def test_zero_wholesale_price_is_stored_as_null(db_session: AsyncSession) -> None:
    await seed_catalog(db_session, [make_row("00001")], image_urls={}, default_stock=1)

    wholesale = await db_session.scalar(select(Product.wholesale_price).where(Product.sku == "00001"))
    assert wholesale is None


async def test_inactive_products_get_zero_stock(db_session: AsyncSession) -> None:
    await seed_catalog(
        db_session,
        [make_row("00001", is_active=False, retail_price=Decimal("0.00"))],
        image_urls={},
        default_stock=40,
    )

    stock = await db_session.scalar(
        select(Inventory.quantity_on_hand).where(Inventory.product_id == product_id_for("00001"))
    )
    assert stock == 0


async def test_demo_users_are_created_once(db_session: AsyncSession) -> None:
    await seed_demo_users(db_session, password="Demo-password-123", environment="development")
    await seed_demo_users(db_session, password="Demo-password-123", environment="development")

    users = (await db_session.scalars(select(User).order_by(User.email))).all()
    assert [u.account_type for u in users] == ["company", "individual"]
    company = users[0]
    assert company.tax_id is not None and len(company.tax_id) == 8
    assert company.password_hash.startswith("$2")


async def test_demo_users_are_refused_in_production(db_session: AsyncSession) -> None:
    with pytest.raises(DemoUsersRefused):
        await seed_demo_users(db_session, password="Demo-password-123", environment="production")
