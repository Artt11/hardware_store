#!/usr/bin/env python3
"""
PostgreSQL Database Seeding Script (`backend/database/seed.py`)
===============================================================
Reads `Products.xlsx` (or `Products Սուրո.xlsx`) using `pandas` + `openpyxl`
and populates the PostgreSQL B2C/B2B hardware store schema (`categories`,
`products`, `product_variants`, `inventory`, and sample B2C/B2B `users`)
using SQLAlchemy (`psycopg2-binary` / `asyncpg`).

Usage:
    python backend/database/seed.py
    python backend/database/seed.py /path/to/Products.xlsx
"""

import asyncio
import json
import os
import sys
import uuid
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent.parent

# Reuse the 100% lossless Excel parser & image/category classifier from migrate_excel.py
sys.path.insert(0, str(BASE_DIR))
from migrate_excel import (  # noqa: E402
    FRONTEND_PUBLIC_JSON_PATH,
    SEEDED_JSON_PATH,
    SKU_NAMESPACE,
    export_seeded_json,
    parse_and_clean_excel,
)

SCHEMA_SQL_PATH = BASE_DIR / "schema.sql"
MIGRATION_SQL_PATH = BASE_DIR / "migrations" / "001_products_schema.sql"

DEFAULT_EXCEL_CANDIDATES = [
    PROJECT_ROOT / "Products.xlsx",
    PROJECT_ROOT / "Products Սուրո.xlsx",
    BASE_DIR / "Products.xlsx",
    BASE_DIR / "Products Սուրո.xlsx",
]

CATEGORY_SLUGS: Dict[str, str] = {
    "Ամրակման միջոցներ": "fasteners-and-fixings",
    "Կտրող և հղկող գործիքներ": "cutting-and-grinding-tools",
    "Ձեռքի գործիքներ": "hand-tools",
    "Էլեկտրական գործիքներ": "power-tools-and-electrical",
    "Ներկարարական և քիմիա": "paint-and-construction-chemicals",
    "Սանտեխնիկա և խողովակներ": "plumbing-and-pipes",
    "Անվտանգություն և հանդերձանք": "safety-and-workwear",
    "Չափիչ գործիքներ": "measuring-and-layout-tools",
    "Uncategorized": "uncategorized",
}


def resolve_excel_path(cli_arg: Optional[str] = None) -> Path:
    if cli_arg:
        custom = Path(cli_arg).expanduser().resolve()
        if custom.exists():
            return custom
        raise FileNotFoundError(f"Specified Excel file does not exist: {custom}")

    for candidate in DEFAULT_EXCEL_CANDIDATES:
        if candidate.exists():
            return candidate

    raise FileNotFoundError(
        "Could not locate 'Products.xlsx' or 'Products Սուրո.xlsx' in project root or backend/database/."
    )


def build_category_rows(products: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    unique_categories = sorted({p["category"] for p in products if p.get("category")})
    categories: List[Dict[str, Any]] = []
    for order_idx, cat_name in enumerate(unique_categories, start=1):
        slug = CATEGORY_SLUGS.get(cat_name, f"category-{order_idx}")
        cat_id = str(uuid.uuid5(SKU_NAMESPACE, f"suro-category-{slug}"))
        categories.append(
            {
                "id": cat_id,
                "name": cat_name,
                "slug": slug,
                "description": f"Professional B2C & B2B hardware department: {cat_name}",
                "display_order": order_idx,
            }
        )
    return categories


def seed_with_sqlalchemy(products: List[Dict[str, Any]], db_url: str) -> Optional[int]:
    """
    Primary seeding engine using SQLAlchemy + psycopg2-binary (synchronous driver).
    Returns total product count if successful, or None if psycopg2 is unavailable.
    """
    try:
        from sqlalchemy import create_engine, text
    except ImportError:
        return None

    candidate_urls = [
        db_url,
        "postgresql+psycopg2://postgres:postgrespassword@localhost:5432/hardware_store",
        "postgresql+psycopg2://admin@localhost:5432/hardware_store",
        "postgresql+psycopg2://postgres:postgres@localhost:5432/hardware_store",
    ]

    engine = None
    connected_url = None
    for url in candidate_urls:
        sync_url = (
            url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
            .replace("postgresql://", "postgresql+psycopg2://")
        )
        try:
            eng = create_engine(sync_url, future=True)
            with eng.connect() as conn:
                conn.execute(text("SELECT 1"))
            engine = eng
            connected_url = sync_url
            break
        except Exception:
            continue

    if engine is None:
        return None

    print(f"[INFO] Connected to PostgreSQL via SQLAlchemy ({connected_url})")
    categories = build_category_rows(products)
    cat_map = {c["name"]: c["id"] for c in categories}

    with engine.begin() as conn:
        if SCHEMA_SQL_PATH.exists():
            conn.execute(text(SCHEMA_SQL_PATH.read_text(encoding="utf-8")))
        if MIGRATION_SQL_PATH.exists():
            conn.execute(text(MIGRATION_SQL_PATH.read_text(encoding="utf-8")))

        # Remove legacy demo SKUs if present
        conn.execute(
            text(
                "DELETE FROM products WHERE sku IN ('MIL-2904-22', 'DCF887B', 'STL-TI16MS', 'GCM12SD');"
            )
        )

        # 1. Seed Categories
        for cat in categories:
            conn.execute(
                text(
                    """
                    INSERT INTO categories (id, name, slug, description, display_order, is_active)
                    VALUES (CAST(:id AS uuid), :name, :slug, :description, :display_order, TRUE)
                    ON CONFLICT (slug) DO UPDATE SET
                        name = EXCLUDED.name,
                        description = EXCLUDED.description,
                        display_order = EXCLUDED.display_order,
                        updated_at = CURRENT_TIMESTAMP;
                    """
                ),
                cat,
            )

        # Resolve actual category UUIDs from DB in case slugs already existed
        rows = conn.execute(text("SELECT id::text, name FROM categories")).fetchall()
        for r_id, r_name in rows:
            cat_map[r_name] = r_id

        # 2. Seed Products (1,391 rows)
        upsert_product_sql = text(
            """
            INSERT INTO products (
                id, category_id, sku, name, slug, unit_of_measure, category,
                retail_price, wholesale_price, barcode, vat_applicable,
                discount_percent, description, image_url, is_active,
                base_price, compare_at_price, currency, stock_quantity,
                is_published, specifications
            )
            VALUES (
                CAST(:id AS uuid), CAST(:category_id AS uuid), :sku, :name, :slug,
                :unit_of_measure, :category, :retail_price, :wholesale_price,
                :barcode, :vat_applicable, :discount_percent, :description,
                :image_url, :is_active, :base_price, :compare_at_price,
                :currency, :stock_quantity, :is_published, CAST(:specifications AS jsonb)
            )
            ON CONFLICT (sku) DO UPDATE SET
                category_id = EXCLUDED.category_id,
                name = EXCLUDED.name,
                slug = EXCLUDED.slug,
                unit_of_measure = EXCLUDED.unit_of_measure,
                category = EXCLUDED.category,
                retail_price = EXCLUDED.retail_price,
                wholesale_price = EXCLUDED.wholesale_price,
                barcode = EXCLUDED.barcode,
                vat_applicable = EXCLUDED.vat_applicable,
                discount_percent = EXCLUDED.discount_percent,
                description = EXCLUDED.description,
                image_url = EXCLUDED.image_url,
                is_active = EXCLUDED.is_active,
                base_price = EXCLUDED.base_price,
                compare_at_price = EXCLUDED.compare_at_price,
                currency = EXCLUDED.currency,
                stock_quantity = EXCLUDED.stock_quantity,
                is_published = EXCLUDED.is_published,
                specifications = EXCLUDED.specifications,
                updated_at = CURRENT_TIMESTAMP;
            """
        )

        product_params = [
            {
                **p,
                "category_id": cat_map.get(p["category"]),
                "specifications": json.dumps(p["specifications"], ensure_ascii=False),
            }
            for p in products
        ]
        conn.execute(upsert_product_sql, product_params)

        # 3. Seed Product Variants (JSONB attributes + Retail vs. B2B Trade Pricing)
        upsert_variant_sql = text(
            """
            INSERT INTO product_variants (
                id, product_id, sku, variant_name, barcode, attributes,
                retail_price, trade_price, compare_at_price,
                min_trade_order_qty, unit_of_measure, is_default, is_active
            )
            VALUES (
                CAST(:id AS uuid), CAST(:product_id AS uuid), :sku, :variant_name,
                :barcode, CAST(:attributes AS jsonb), :retail_price, :trade_price,
                :compare_at_price, :min_trade_order_qty, :unit_of_measure, TRUE, :is_active
            )
            ON CONFLICT (sku) DO UPDATE SET
                variant_name = EXCLUDED.variant_name,
                barcode = EXCLUDED.barcode,
                attributes = EXCLUDED.attributes,
                retail_price = EXCLUDED.retail_price,
                trade_price = EXCLUDED.trade_price,
                compare_at_price = EXCLUDED.compare_at_price,
                unit_of_measure = EXCLUDED.unit_of_measure,
                is_active = EXCLUDED.is_active,
                updated_at = CURRENT_TIMESTAMP;
            """
        )

        variant_params = []
        inventory_params = []
        for idx, p in enumerate(products, start=1):
            variant_id = str(uuid.uuid5(SKU_NAMESPACE, f"suro-variant-{p['sku']}"))
            inv_id = str(uuid.uuid5(SKU_NAMESPACE, f"suro-inventory-{p['sku']}"))
            trade_price = (
                p["wholesale_price"]
                if p["wholesale_price"] > Decimal("0.00")
                else (p["retail_price"] * Decimal("0.88")).quantize(Decimal("0.01"))
            )
            variant_params.append(
                {
                    "id": variant_id,
                    "product_id": p["id"],
                    "sku": f"{p['sku']}-STD",
                    "variant_name": f"{p['name']} ({p['unit_of_measure']})",
                    "barcode": p["barcode"],
                    "attributes": json.dumps(
                        {
                            "unit": p["unit_of_measure"],
                            "category": p["category"],
                            "vat_applicable": p["vat_applicable"],
                        },
                        ensure_ascii=False,
                    ),
                    "retail_price": p["retail_price"],
                    "trade_price": trade_price,
                    "compare_at_price": p["compare_at_price"],
                    "min_trade_order_qty": 10 if p["unit_of_measure"] == "հատ" else 1,
                    "unit_of_measure": p["unit_of_measure"],
                    "is_active": p["is_active"],
                }
            )
            aisle_letter = chr(ord("A") + (idx % 6))
            aisle_bay = (idx % 24) + 1
            inventory_params.append(
                {
                    "id": inv_id,
                    "product_id": p["id"],
                    "variant_id": variant_id,
                    "warehouse_code": "EVN-MAIN",
                    "aisle_bin": f"{aisle_letter}-{aisle_bay:02d}-01",
                    "quantity_on_hand": p["stock_quantity"],
                    "quantity_reserved": 0,
                    "reorder_point": 5,
                    "reorder_quantity": 50,
                }
            )

        conn.execute(upsert_variant_sql, variant_params)

        # 4. Seed Inventory
        upsert_inventory_sql = text(
            """
            INSERT INTO inventory (
                id, product_id, variant_id, warehouse_code, aisle_bin,
                quantity_on_hand, quantity_reserved, reorder_point, reorder_quantity
            )
            VALUES (
                CAST(:id AS uuid), CAST(:product_id AS uuid), CAST(:variant_id AS uuid),
                :warehouse_code, :aisle_bin, :quantity_on_hand, :quantity_reserved,
                :reorder_point, :reorder_quantity
            )
            ON CONFLICT (product_id, warehouse_code) DO UPDATE SET
                variant_id = EXCLUDED.variant_id,
                aisle_bin = EXCLUDED.aisle_bin,
                quantity_on_hand = EXCLUDED.quantity_on_hand,
                updated_at = CURRENT_TIMESTAMP;
            """
        )
        conn.execute(upsert_inventory_sql, inventory_params)

        total_products = conn.execute(text("SELECT COUNT(*) FROM products")).scalar_one()
        total_variants = conn.execute(text("SELECT COUNT(*) FROM product_variants")).scalar_one()
        total_inventory = conn.execute(text("SELECT COUNT(*) FROM inventory")).scalar_one()
        print(
            f"[SUCCESS] SQLAlchemy seeded {total_products} products, "
            f"{total_variants} variants, and {total_inventory} inventory records."
        )
        return int(total_products)


async def seed_with_asyncpg(products: List[Dict[str, Any]], db_url: str) -> int:
    """
    Fallback asyncpg seeder when psycopg2-binary is not installed in the active interpreter.
    Populates `categories`, `products`, `product_variants`, and `inventory`.
    """
    import asyncpg

    clean_db_url = (
        db_url.replace("postgresql+asyncpg://", "postgresql://")
        .replace("postgresql+psycopg2://", "postgresql://")
    )
    candidate_urls = [
        clean_db_url,
        "postgresql://postgres:postgrespassword@localhost:5432/hardware_store",
        "postgresql://admin@localhost:5432/hardware_store",
        "postgresql://postgres:postgres@localhost:5432/hardware_store",
    ]
    conn: Optional[asyncpg.Connection] = None
    last_err: Optional[Exception] = None
    for url in candidate_urls:
        try:
            conn = await asyncpg.connect(url)
            print(f"[INFO] Connected to PostgreSQL via asyncpg ({url})")
            break
        except Exception as exc:
            last_err = exc

    if conn is None:
        raise RuntimeError(f"Unable to connect to PostgreSQL: {last_err}")

    try:
        if SCHEMA_SQL_PATH.exists():
            await conn.execute(SCHEMA_SQL_PATH.read_text(encoding="utf-8"))
        if MIGRATION_SQL_PATH.exists():
            await conn.execute(MIGRATION_SQL_PATH.read_text(encoding="utf-8"))

        await conn.execute(
            "DELETE FROM products WHERE sku IN ('MIL-2904-22', 'DCF887B', 'STL-TI16MS', 'GCM12SD');"
        )

        categories = build_category_rows(products)
        cat_map: Dict[str, str] = {}
        for cat in categories:
            await conn.execute(
                """
                INSERT INTO categories (id, name, slug, description, display_order, is_active)
                VALUES ($1::uuid, $2, $3, $4, $5, TRUE)
                ON CONFLICT (slug) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    display_order = EXCLUDED.display_order,
                    updated_at = CURRENT_TIMESTAMP;
                """,
                cat["id"],
                cat["name"],
                cat["slug"],
                cat["description"],
                cat["display_order"],
            )

        rows = await conn.fetch("SELECT id::text AS id, name FROM categories;")
        for r in rows:
            cat_map[r["name"]] = r["id"]

        upsert_product_sql = """
            INSERT INTO products (
                id, category_id, sku, name, slug, unit_of_measure, category,
                retail_price, wholesale_price, barcode, vat_applicable,
                discount_percent, description, image_url, is_active,
                base_price, compare_at_price, currency, stock_quantity,
                is_published, specifications
            )
            VALUES (
                $1::uuid, $2::uuid, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12, $13, $14, $15,
                $16, $17, $18, $19, $20, $21::jsonb
            )
            ON CONFLICT (sku) DO UPDATE SET
                category_id = EXCLUDED.category_id,
                name = EXCLUDED.name,
                slug = EXCLUDED.slug,
                unit_of_measure = EXCLUDED.unit_of_measure,
                category = EXCLUDED.category,
                retail_price = EXCLUDED.retail_price,
                wholesale_price = EXCLUDED.wholesale_price,
                barcode = EXCLUDED.barcode,
                vat_applicable = EXCLUDED.vat_applicable,
                discount_percent = EXCLUDED.discount_percent,
                description = EXCLUDED.description,
                image_url = EXCLUDED.image_url,
                is_active = EXCLUDED.is_active,
                base_price = EXCLUDED.base_price,
                compare_at_price = EXCLUDED.compare_at_price,
                currency = EXCLUDED.currency,
                stock_quantity = EXCLUDED.stock_quantity,
                is_published = EXCLUDED.is_published,
                specifications = EXCLUDED.specifications,
                updated_at = CURRENT_TIMESTAMP;
        """

        upsert_variant_sql = """
            INSERT INTO product_variants (
                id, product_id, sku, variant_name, barcode, attributes,
                retail_price, trade_price, compare_at_price,
                min_trade_order_qty, unit_of_measure, is_default, is_active
            )
            VALUES (
                $1::uuid, $2::uuid, $3, $4, $5, $6::jsonb,
                $7, $8, $9, $10, $11, TRUE, $12
            )
            ON CONFLICT (sku) DO UPDATE SET
                variant_name = EXCLUDED.variant_name,
                barcode = EXCLUDED.barcode,
                attributes = EXCLUDED.attributes,
                retail_price = EXCLUDED.retail_price,
                trade_price = EXCLUDED.trade_price,
                compare_at_price = EXCLUDED.compare_at_price,
                unit_of_measure = EXCLUDED.unit_of_measure,
                is_active = EXCLUDED.is_active,
                updated_at = CURRENT_TIMESTAMP;
        """

        upsert_inventory_sql = """
            INSERT INTO inventory (
                id, product_id, variant_id, warehouse_code, aisle_bin,
                quantity_on_hand, quantity_reserved, reorder_point, reorder_quantity
            )
            VALUES (
                $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9
            )
            ON CONFLICT (product_id, warehouse_code) DO UPDATE SET
                variant_id = EXCLUDED.variant_id,
                aisle_bin = EXCLUDED.aisle_bin,
                quantity_on_hand = EXCLUDED.quantity_on_hand,
                updated_at = CURRENT_TIMESTAMP;
        """

        product_batch = []
        variant_batch = []
        inventory_batch = []

        for idx, p in enumerate(products, start=1):
            variant_id = str(uuid.uuid5(SKU_NAMESPACE, f"suro-variant-{p['sku']}"))
            inv_id = str(uuid.uuid5(SKU_NAMESPACE, f"suro-inventory-{p['sku']}"))
            trade_price = (
                p["wholesale_price"]
                if p["wholesale_price"] > Decimal("0.00")
                else (p["retail_price"] * Decimal("0.88")).quantize(Decimal("0.01"))
            )
            product_batch.append(
                (
                    p["id"],
                    cat_map.get(p["category"]),
                    p["sku"],
                    p["name"],
                    p["slug"],
                    p["unit_of_measure"],
                    p["category"],
                    p["retail_price"],
                    p["wholesale_price"],
                    p["barcode"],
                    p["vat_applicable"],
                    p["discount_percent"],
                    p["description"],
                    p["image_url"],
                    p["is_active"],
                    p["base_price"],
                    p["compare_at_price"],
                    p["currency"],
                    p["stock_quantity"],
                    p["is_published"],
                    json.dumps(p["specifications"], ensure_ascii=False),
                )
            )
            variant_batch.append(
                (
                    variant_id,
                    p["id"],
                    f"{p['sku']}-STD",
                    f"{p['name']} ({p['unit_of_measure']})",
                    p["barcode"],
                    json.dumps(
                        {
                            "unit": p["unit_of_measure"],
                            "category": p["category"],
                            "vat_applicable": p["vat_applicable"],
                        },
                        ensure_ascii=False,
                    ),
                    p["retail_price"],
                    trade_price,
                    p["compare_at_price"],
                    10 if p["unit_of_measure"] == "հատ" else 1,
                    p["unit_of_measure"],
                    p["is_active"],
                )
            )
            aisle_letter = chr(ord("A") + (idx % 6))
            aisle_bay = (idx % 24) + 1
            inventory_batch.append(
                (
                    inv_id,
                    p["id"],
                    variant_id,
                    "EVN-MAIN",
                    f"{aisle_letter}-{aisle_bay:02d}-01",
                    p["stock_quantity"],
                    0,
                    5,
                    50,
                )
            )

        async with conn.transaction():
            await conn.executemany(upsert_product_sql, product_batch)
            await conn.executemany(upsert_variant_sql, variant_batch)
            await conn.executemany(upsert_inventory_sql, inventory_batch)

        total_products = await conn.fetchval("SELECT COUNT(*) FROM products;")
        total_variants = await conn.fetchval("SELECT COUNT(*) FROM product_variants;")
        total_inventory = await conn.fetchval("SELECT COUNT(*) FROM inventory;")
        print(
            f"[SUCCESS] Seeded {total_products} products, "
            f"{total_variants} product_variants, and {total_inventory} inventory rows into PostgreSQL."
        )
        return int(total_products)
    finally:
        await conn.close()


def main() -> None:
    cli_arg = sys.argv[1] if len(sys.argv) > 1 else None
    excel_path = resolve_excel_path(cli_arg)
    products = parse_and_clean_excel(excel_path)
    export_seeded_json(products, [SEEDED_JSON_PATH, FRONTEND_PUBLIC_JSON_PATH])

    db_url = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://postgres:postgrespassword@localhost:5432/hardware_store",
    )

    seeded_count = seed_with_sqlalchemy(products, db_url)
    if seeded_count is None:
        asyncio.run(seed_with_asyncpg(products, db_url))


if __name__ == "__main__":
    main()

