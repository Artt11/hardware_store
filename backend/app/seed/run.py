"""Idempotent catalog seeder: Լավնա.xlsx -> PostgreSQL (+ product images).

    python -m app.seed.run                       # catalog + images
    SEED_DEMO_PASSWORD=... python -m app.seed.run --demo-users

Re-running is safe: categories/products are upserted by slug/SKU, product ids are
derived from the SKU (stable across database resets), and existing inventory rows
are never overwritten, so stock already decremented by orders is preserved.
"""

import argparse
import asyncio
import os
import sys
import uuid
from collections.abc import Sequence
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.models import Category, Inventory, Product, User
from app.seed.categories import ALL_CATEGORIES
from app.seed.excel import ProductRow, parse_workbook
from app.seed.images import extract_images
from app.seed.translations import Translations, read_translations

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_EXCEL = BACKEND_DIR / "database" / "Լավնա.xlsx"
DEFAULT_IMAGES_DIR = BACKEND_DIR.parent / "frontend" / "public" / "images" / "products"
DEFAULT_TRANSLATIONS = BACKEND_DIR / "database" / "product_translations.xlsx"
PRODUCT_NAMESPACE = uuid.UUID("5d1b7a3e-2c4f-4e8a-9b6d-0f1e2d3c4b5a")
BATCH_SIZE = 500


class DemoUsersRefused(RuntimeError):
    pass


def product_id_for(sku: str) -> uuid.UUID:
    return uuid.uuid5(PRODUCT_NAMESPACE, f"product:{sku}")


def _wholesale(row: ProductRow) -> Decimal | None:
    """0 or above-retail wholesale prices are not real B2B prices: use retail (NULL)."""
    w = row.wholesale_price
    return w if Decimal("0") < w <= row.retail_price else None


async def seed_categories(db: AsyncSession) -> dict[str, uuid.UUID]:
    base = insert(Category).values(
        [{"slug": c.slug, "name": c.name, "display_order": i} for i, c in enumerate(ALL_CATEGORIES)]
    )
    upsert = base.on_conflict_do_update(
        index_elements=[Category.slug],
        set_={"name": base.excluded.name, "display_order": base.excluded.display_order},
    ).returning(Category.slug, Category.id)
    return {slug: cid for slug, cid in (await db.execute(upsert)).all()}


async def seed_catalog(
    db: AsyncSession, rows: Sequence[ProductRow], *, image_urls: dict[str, str], default_stock: int
) -> None:
    category_ids = await seed_categories(db)
    updatable = (
        "category_id",
        "slug",
        "name",
        "unit_of_measure",
        "retail_price",
        "wholesale_price",
        "discount_percent",
        "barcode",
        "description",
        "vat_applicable",
        "is_active",
        "image_url",
    )
    for start in range(0, len(rows), BATCH_SIZE):
        batch = rows[start : start + BATCH_SIZE]
        values: list[dict[str, Any]] = [
            {
                "id": product_id_for(r.sku),
                "category_id": category_ids[r.category_slug],
                "sku": r.sku,
                "slug": f"p-{r.sku.lower()}",
                "name": r.name,
                "unit_of_measure": r.unit_of_measure,
                "retail_price": r.retail_price,
                "wholesale_price": _wholesale(r),
                "discount_percent": r.discount_percent,
                "barcode": r.barcode,
                "description": r.description,
                "vat_applicable": r.vat_applicable,
                "is_active": r.is_active,
                "image_url": image_urls.get(r.sku),
            }
            for r in batch
        ]
        product_stmt = insert(Product).values(values)
        await db.execute(
            product_stmt.on_conflict_do_update(
                index_elements=[Product.sku],
                set_={col: product_stmt.excluded[col] for col in updatable},
            )
        )
        # Only create missing inventory rows; never overwrite live stock.
        await db.execute(
            insert(Inventory)
            .values(
                [
                    {
                        "product_id": product_id_for(r.sku),
                        "quantity_on_hand": default_stock if r.is_active else 0,
                    }
                    for r in batch
                ]
            )
            .on_conflict_do_nothing(index_elements=[Inventory.product_id])
        )


async def apply_translations(db: AsyncSession, translations: Translations) -> list[str]:
    """Set name_ru/name_en by SKU. Returns SKUs that do not exist in the catalog."""
    known = set(await db.scalars(select(Product.sku).where(Product.sku.in_(translations))))
    for sku, (ru, en) in translations.items():
        if sku in known:
            await db.execute(update(Product).where(Product.sku == sku).values(name_ru=ru, name_en=en))
    return sorted(set(translations) - known)


DEMO_USERS: tuple[dict[str, Any], ...] = (
    {
        "email": "demo.customer@suro.am",
        "account_type": "individual",
        "first_name": "Անի",
        "last_name": "Սարգսյան",
        "phone": "+37491000001",
    },
    {
        "email": "demo.company@suro.am",
        "account_type": "company",
        "company_name": "Demo Construction LLC",
        "tax_id": "02345678",
        "contact_person": "Դավիթ Հակոբյան",
        "phone": "+37499000002",
        "credit_limit": Decimal("5000000.00"),
        "payment_terms_days": 30,
    },
)


async def seed_demo_users(db: AsyncSession, *, password: str, environment: str) -> int:
    """Create demo accounts that do not exist yet. Never in production."""
    if environment == "production":
        raise DemoUsersRefused("Demo users are never created in production.")
    existing = set(
        await db.scalars(select(User.email).where(User.email.in_([u["email"] for u in DEMO_USERS])))
    )
    missing = [u for u in DEMO_USERS if u["email"] not in existing]
    for spec in missing:
        password_hash = await asyncio.to_thread(hash_password, password)
        await db.execute(
            insert(User)
            .values(**spec, password_hash=password_hash, is_verified=True)
            .on_conflict_do_nothing(index_elements=[User.email])
        )
    return len(missing)


async def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--excel", type=Path, default=DEFAULT_EXCEL)
    parser.add_argument("--images-dir", type=Path, default=DEFAULT_IMAGES_DIR)
    parser.add_argument(
        "--translations",
        type=Path,
        default=DEFAULT_TRANSLATIONS,
        help="product name translations workbook (skipped if missing)",
    )
    parser.add_argument(
        "--stock",
        type=int,
        default=int(os.environ.get("SEED_DEFAULT_STOCK", "100")),
        help="demo stock for newly created inventory rows (Excel has no stock column)",
    )
    parser.add_argument(
        "--demo-users", action="store_true", help="create demo accounts (needs SEED_DEMO_PASSWORD)"
    )
    args = parser.parse_args(argv)

    from app.core.database import SessionFactory, dispose_engine

    parsed = parse_workbook(args.excel)
    images = extract_images(
        args.excel,
        header_row=parsed.header_row,
        sku_by_row={p.row_number: p.sku for p in parsed.products},
        out_dir=args.images_dir,
    )
    try:
        async with SessionFactory() as db, db.begin():
            await seed_catalog(db, parsed.products, image_urls=images.urls, default_stock=args.stock)
            translations = read_translations(args.translations) if args.translations.exists() else {}
            unknown_skus = await apply_translations(db, translations)
            created_users = 0
            if args.demo_users:
                password = os.environ.get("SEED_DEMO_PASSWORD", "")
                if len(password) < 12:
                    print(
                        "SEED_DEMO_PASSWORD must be set (>= 12 chars) to create demo users.", file=sys.stderr
                    )
                    return 2
                created_users = await seed_demo_users(db, password=password, environment=settings.ENVIRONMENT)
    finally:
        await dispose_engine()

    print(
        f"Products: {len(parsed.products)} upserted, {len(parsed.skipped)} skipped, "
        f"{len(parsed.warnings)} warnings"
    )
    print(f"Images:   {len(images.urls)} extracted, {len(images.unmatched)} unmatched")
    applied = len(translations) - len(unknown_skus)
    print(f"Translations: {applied} applied, unknown SKUs: {unknown_skus or 'none'}")
    if args.demo_users:
        print(f"Demo users created: {created_users}")
    for issue in parsed.skipped:
        print(f"  skipped row {issue.row_number}: {issue.reason}")
    for line in images.unmatched:
        print(f"  image {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
