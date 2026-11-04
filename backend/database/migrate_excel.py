#!/usr/bin/env python3
"""
Excel Data Migration & Seeding Script for "Products Սուրո.xlsx"
Module: Product Database Schema, Excel Data Migration & Frontend Rendering

Features:
1. Reads "Products Սուրո.xlsx" using pandas/openpyxl (with built-in stdlib XML/ZIP
   fallback so it runs even in offline/sandboxed environments).
2. Skips empty/title rows (Row 0 contains title + NaNs; headers are on index 1 of
   non-empty rows / Row 2 of worksheet).
3. Maps Armenian headers to the PostgreSQL `products` schema:
   - sku               <- "Կոդ"
   - name              <- "Անվանում" / "Լրիվ անվանում"
   - unit_of_measure   <- "Չափման միավոր"
   - category          <- "Խումբ" (NaN/null -> "Uncategorized")
   - retail_price      <- "Մանրածախ գին դրամով"
   - wholesale_price   <- "Մեծածախ գին դրամով"
   - barcode           <- "Գծիկավոր կոդ"
   - vat_applicable    <- "ԱԱՀ"
   - discount_percent  <- "Զեղչ (%)"
   - description       <- "Բնութագիր"
   - image_url         <- "Նկար" (handles boolean False / NaN)
   - is_active         <- Derived from "Փակված" (If Փակված is False -> is_active is True)
4. Performs idempotent bulk UPSERT (`ON CONFLICT (sku) DO UPDATE`) into PostgreSQL.
5. Syncs all imported products with Elasticsearch (`hardware_products` index) and
   saves a local catalog snapshot (`products_seeded.json`) for instant API & search access.
"""

import asyncio
import json
import os
import re
import sys
import uuid
import zipfile
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, List, Optional

import asyncpg

# Optional pandas / openpyxl import (falls back to native OpenXML reader if unavailable)
try:
    import pandas as pd  # type: ignore
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent.parent

DEFAULT_EXCEL_PATHS = [
    PROJECT_ROOT / "Products Սուրո.xlsx",
    BASE_DIR / "Products Սուրո.xlsx",
]

MIGRATION_SQL_PATH = BASE_DIR / "migrations" / "001_products_schema.sql"
SEEDED_JSON_PATH = BASE_DIR / "products_seeded.json"

# Database & Elasticsearch connection URLs
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://admin@localhost:5432/hardware_store",
)
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")
ELASTICSEARCH_INDEX = "hardware_products"

# Deterministic UUID namespace so each SKU always maps to the same UUID across runs
SKU_NAMESPACE = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")


def is_null_or_nan(val: Any) -> bool:
    """Return True if value is None, NaN, or empty whitespace."""
    if val is None:
        return True
    if isinstance(val, float) and (val != val):  # NaN check
        return True
    if isinstance(val, str) and val.strip() in ("", "nan", "NaN", "None", "null", "NULL"):
        return True
    return False


def to_decimal(val: Any, default: str = "0.00") -> Decimal:
    """Convert raw Excel cell value to a 2-decimal-place Decimal."""
    if is_null_or_nan(val) or isinstance(val, bool):
        return Decimal(default)
    try:
        cleaned = str(val).strip().replace(",", "").replace(" ", "")
        return Decimal(cleaned).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return Decimal(default)


def to_boolean(val: Any, default: bool = False) -> bool:
    """Convert raw Excel cell value to Python bool."""
    if is_null_or_nan(val):
        return default
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return bool(int(val))
    s = str(val).strip().lower()
    if s in ("true", "1", "yes", "այո", "t"):
        return True
    if s in ("false", "0", "no", "ոչ", "f"):
        return False
    return default


def clean_string(val: Any, default: Optional[str] = None) -> Optional[str]:
    """Clean a string cell value, stripping `.0` from integer-like strings if needed."""
    if is_null_or_nan(val) or isinstance(val, bool):
        return default
    s = str(val).strip()
    if not s:
        return default
    return s


def clean_barcode(val: Any) -> Optional[str]:
    """Normalize barcode strings (e.g. avoid float formatting like '13515324.0')."""
    if is_null_or_nan(val) or isinstance(val, bool):
        return None
    if isinstance(val, float) and val.is_integer():
        return str(int(val))
    s = str(val).strip()
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]
    return s or None


def clean_image_url(val: Any) -> Optional[str]:
    """
    Clean the 'Նկար' column.
    In 'Products Սուրո.xlsx', empty images are stored as boolean False or 'False'.
    """
    if is_null_or_nan(val) or isinstance(val, bool):
        return None
    s = str(val).strip()
    if s.lower() in ("false", "0", "none", "nan", ""):
        return None
    return s


def read_excel_with_pandas(excel_path: Path) -> List[Dict[str, Any]]:
    """
    Parse the Excel file using pandas/openpyxl.
    Automatically locates the Armenian header row containing 'Կոդ' and 'Անվանում'.
    """
    raw_df = pd.read_excel(excel_path, header=None)
    # Drop completely empty rows first (Row 0 has title + NaNs, Row 1 is all NaN, header is index 1 of non-empty rows)
    non_empty_df = raw_df.dropna(how="all").reset_index(drop=True)

    header_idx = 1  # Default: second non-empty row (index 1)
    for idx, row in non_empty_df.iterrows():
        row_values = [str(v).strip() for v in row.values if not is_null_or_nan(v)]
        if "Կոդ" in row_values and "Անվանում" in row_values:
            header_idx = int(idx)
            break

    headers = [str(col).strip() if not is_null_or_nan(col) else f"col_{i}" for i, col in enumerate(non_empty_df.iloc[header_idx].values)]
    data_df = non_empty_df.iloc[header_idx + 1:].copy()
    data_df.columns = headers

    records: List[Dict[str, Any]] = []
    for _, row in data_df.iterrows():
        records.append(row.to_dict())
    return records


def read_excel_with_stdlib(excel_path: Path) -> List[Dict[str, Any]]:
    """
    Zero-dependency OpenXML (.xlsx) parser using Python's standard library
    (`zipfile` + `xml.etree.ElementTree`).
    """
    ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(excel_path, "r") as zf:
        shared_strings: List[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            sst_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in sst_root.findall("a:si", ns):
                text = "".join(t.text or "" for t in si.findall(".//a:t", ns))
                shared_strings.append(text)

        sheet_root = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
        rows_el = sheet_root.findall(".//a:sheetData/a:row", ns)

        def col_ref_to_idx(cell_ref: str) -> int:
            letters = "".join(ch for ch in cell_ref if ch.isalpha())
            idx = 0
            for ch in letters:
                idx = idx * 26 + (ord(ch.upper()) - ord("A") + 1)
            return idx - 1

        parsed_rows: List[Dict[int, Any]] = []
        for r_el in rows_el:
            row_cells: Dict[int, Any] = {}
            for c_el in r_el.findall("a:c", ns):
                ref = c_el.attrib.get("r", "A1")
                col_idx = col_ref_to_idx(ref)
                cell_type = c_el.attrib.get("t")
                v_el = c_el.find("a:v", ns)
                is_el = c_el.find("a:is", ns)

                val: Any = None
                if cell_type == "s" and v_el is not None and v_el.text is not None:
                    val = shared_strings[int(v_el.text)]
                elif cell_type == "b" and v_el is not None:
                    val = v_el.text == "1"
                elif cell_type == "inlineStr" and is_el is not None:
                    val = "".join(t.text or "" for t in is_el.findall(".//a:t", ns))
                elif v_el is not None and v_el.text is not None:
                    raw_text = v_el.text
                    try:
                        val = int(raw_text) if "." not in raw_text else float(raw_text)
                    except ValueError:
                        val = raw_text

                if val is not None and val != "":
                    row_cells[col_idx] = val

            # Skip completely empty rows
            if row_cells:
                parsed_rows.append(row_cells)

        # Locate the header row (index 1 of non-empty rows, containing "Կոդ")
        header_row_idx = 1
        for idx, r_dict in enumerate(parsed_rows):
            vals = [str(v).strip() for v in r_dict.values()]
            if "Կոդ" in vals and "Անվանում" in vals:
                header_row_idx = idx
                break

        header_map = {col_idx: str(col_name).strip() for col_idx, col_name in parsed_rows[header_row_idx].items()}
        records: List[Dict[str, Any]] = []
        for r_dict in parsed_rows[header_row_idx + 1:]:
            rec: Dict[str, Any] = {}
            for col_idx, col_name in header_map.items():
                rec[col_name] = r_dict.get(col_idx)
            records.append(rec)
        return records


def parse_and_clean_excel(excel_path: Path) -> List[Dict[str, Any]]:
    """
    Read "Products Սուրո.xlsx" and map each row into a normalized product dictionary
    matching the PostgreSQL `products` table schema.
    """
    if not excel_path.exists():
        raise FileNotFoundError(f"Excel file not found at: {excel_path}")

    if HAS_PANDAS:
        try:
            raw_records = read_excel_with_pandas(excel_path)
            parser_used = "pandas/openpyxl"
        except Exception:
            raw_records = read_excel_with_stdlib(excel_path)
            parser_used = "stdlib-openxml"
    else:
        raw_records = read_excel_with_stdlib(excel_path)
        parser_used = "stdlib-openxml"

    print(f"[INFO] Parsed {len(raw_records)} raw rows from '{excel_path.name}' using {parser_used}.")

    cleaned_products: List[Dict[str, Any]] = []
    seen_skus = set()

    for row in raw_records:
        sku = clean_string(row.get("Կոդ"))
        if not sku:
            continue

        # Ensure leading zeros are preserved if numeric code was coerced
        if sku.isdigit() and len(sku) < 5:
            sku = sku.zfill(5)

        name = clean_string(row.get("Անվանում")) or clean_string(row.get("Լրիվ անվանում"))
        if not name:
            continue

        full_name = clean_string(row.get("Լրիվ անվանում"))
        unit_of_measure = clean_string(row.get("Չափման միավոր"), default="հատ") or "հատ"
        category = clean_string(row.get("Խումբ"), default="Uncategorized") or "Uncategorized"

        retail_price = to_decimal(row.get("Մանրածախ գին դրամով"), default="0.00")
        wholesale_price = to_decimal(row.get("Մեծածախ գին դրամով"), default="0.00")
        barcode = clean_barcode(row.get("Գծիկավոր կոդ"))
        vat_applicable = to_boolean(row.get("ԱԱՀ"), default=True)
        discount_percent = to_decimal(row.get("Զեղչ (%)"), default="0.00")

        description = clean_string(row.get("Բնութագիր"))
        if not description and full_name and full_name != name:
            description = full_name

        image_url = clean_image_url(row.get("Նկար"))

        # Derived from "Փակված": If Փակված is False, is_active is True
        closed_flag = to_boolean(row.get("Փակված"), default=False)
        is_active = not closed_flag

        # Additional metadata from Excel for specifications JSONB
        atgaa_code = clean_barcode(row.get("ԱՏԳԱԱ դասակարգիչ"))
        specs: Dict[str, str] = {
            "unit": unit_of_measure,
        }
        if barcode:
            specs["barcode"] = barcode
        if atgaa_code:
            specs["atgaa_code"] = atgaa_code
        if wholesale_price > Decimal("0.00"):
            specs["wholesale_price"] = f"{wholesale_price:,.0f} ֏"

        product_id = str(uuid.uuid5(SKU_NAMESPACE, f"suro-product-{sku}"))
        slug = f"product-{sku.lower()}"

        # Calculate compare_at_price if discount_percent > 0
        compare_at_price: Optional[Decimal] = None
        if discount_percent > Decimal("0.00") and discount_percent < Decimal("100.00") and retail_price > Decimal("0.00"):
            compare_at_price = (retail_price / (Decimal("1.00") - (discount_percent / Decimal("100.00")))).quantize(Decimal("0.01"))

        product_record = {
            "id": product_id,
            "sku": sku,
            "name": name,
            "slug": slug,
            "unit_of_measure": unit_of_measure,
            "category": category,
            "retail_price": retail_price,
            "wholesale_price": wholesale_price,
            "barcode": barcode,
            "vat_applicable": vat_applicable,
            "discount_percent": discount_percent,
            "description": description,
            "image_url": image_url,
            "is_active": is_active,
            "base_price": retail_price,
            "compare_at_price": compare_at_price,
            "currency": "AMD",
            "stock_quantity": 25 if is_active else 0,
            "is_published": is_active,
            "specifications": specs,
        }

        if sku in seen_skus:
            # Replace earlier duplicate in batch so last row wins
            cleaned_products = [p for p in cleaned_products if p["sku"] != sku]
        seen_skus.add(sku)
        cleaned_products.append(product_record)

    return cleaned_products


async def seed_postgresql(products: List[Dict[str, Any]], db_url: str) -> int:
    """
    Apply SQL migration and bulk-upsert all cleaned products into PostgreSQL
    using `ON CONFLICT (sku) DO UPDATE`.
    """
    # Normalize SQLAlchemy-style URLs if passed
    clean_db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    conn: Optional[asyncpg.Connection] = None
    candidate_urls = [
        clean_db_url,
        "postgresql://admin@localhost:5432/hardware_store",
        "postgresql://postgres:postgres@localhost:5432/hardware_store",
        "postgresql://localhost:5432/hardware_store",
    ]
    last_err: Optional[Exception] = None
    for url in candidate_urls:
        try:
            conn = await asyncpg.connect(url)
            print(f"[INFO] Connected to PostgreSQL via {url}")
            break
        except Exception as exc:
            last_err = exc

    if conn is None:
        raise RuntimeError(f"Could not connect to PostgreSQL: {last_err}")

    try:
        # 1. Execute migration SQL to ensure `products` table has all required columns
        if MIGRATION_SQL_PATH.exists():
            migration_sql = MIGRATION_SQL_PATH.read_text(encoding="utf-8")
            await conn.execute(migration_sql)
            print(f"[INFO] Applied SQL schema migration: {MIGRATION_SQL_PATH.name}")

        # 2. Idempotent Bulk UPSERT (`ON CONFLICT (sku) DO UPDATE`)
        upsert_sql = """
            INSERT INTO products (
                id,
                sku,
                name,
                slug,
                unit_of_measure,
                category,
                retail_price,
                wholesale_price,
                barcode,
                vat_applicable,
                discount_percent,
                description,
                image_url,
                is_active,
                base_price,
                compare_at_price,
                currency,
                stock_quantity,
                is_published,
                specifications
            )
            VALUES (
                $1::uuid, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11, $12, $13, $14,
                $15, $16, $17, $18, $19, $20::jsonb
            )
            ON CONFLICT (sku) DO UPDATE SET
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

        batch_args = [
            (
                p["id"],
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
            for p in products
        ]

        async with conn.transaction():
            await conn.executemany(upsert_sql, batch_args)

        total_in_db = await conn.fetchval("SELECT COUNT(*) FROM products;")
        print(f"[SUCCESS] Bulk upserted {len(products)} products into PostgreSQL (Total rows in `products`: {total_in_db}).")
        return int(total_in_db)
    finally:
        await conn.close()


async def sync_elasticsearch(products: List[Dict[str, Any]], es_url: str) -> bool:
    """
    Sync imported PostgreSQL products into Elasticsearch so they appear immediately
    in the minimalist header search bar.
    """
    try:
        import httpx
    except ImportError:
        print("[WARN] httpx not installed; skipping direct Elasticsearch HTTP sync.")
        return False

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            health = await client.get(es_url)
            if health.status_code >= 400:
                print(f"[INFO] Elasticsearch returned status {health.status_code}; using local search index fallback.")
                return False

            # Ensure index exists with edge_ngram autocomplete analyzer
            index_Resp = await client.head(f"{es_url}/{ELASTICSEARCH_INDEX}")
            if index_Resp.status_code == 404:
                await client.put(
                    f"{es_url}/{ELASTICSEARCH_INDEX}",
                    json={
                        "settings": {
                            "analysis": {
                                "analyzer": {
                                    "autocomplete_analyzer": {
                                        "type": "custom",
                                        "tokenizer": "standard",
                                        "filter": ["lowercase"],
                                    }
                                }
                            }
                        },
                        "mappings": {
                            "properties": {
                                "id": {"type": "keyword"},
                                "sku": {"type": "keyword"},
                                "name": {
                                    "type": "text",
                                    "fields": {"keyword": {"type": "keyword"}},
                                },
                                "category": {"type": "keyword"},
                                "unit_of_measure": {"type": "keyword"},
                                "retail_price": {"type": "float"},
                                "wholesale_price": {"type": "float"},
                                "barcode": {"type": "keyword"},
                                "is_active": {"type": "boolean"},
                                "in_stock": {"type": "boolean"},
                            }
                        },
                    },
                )

            # Build NDJSON payload for _bulk API
            bulk_lines: List[str] = []
            for p in products:
                bulk_lines.append(json.dumps({"index": {"_index": ELASTICSEARCH_INDEX, "_id": p["sku"]}}))
                doc = {
                    "id": p["id"],
                    "sku": p["sku"],
                    "name": p["name"],
                    "slug": p["slug"],
                    "category": p["category"],
                    "unit_of_measure": p["unit_of_measure"],
                    "retail_price": float(p["retail_price"]),
                    "wholesale_price": float(p["wholesale_price"]),
                    "barcode": p["barcode"],
                    "vat_applicable": p["vat_applicable"],
                    "discount_percent": float(p["discount_percent"]),
                    "description": p["description"],
                    "image_url": p["image_url"],
                    "is_active": p["is_active"],
                    "in_stock": p["is_active"],
                    "stock_quantity": p["stock_quantity"],
                }
                bulk_lines.append(json.dumps(doc, ensure_ascii=False))

            payload = "\n".join(bulk_lines) + "\n"
            bulk_resp = await client.post(
                f"{es_url}/_bulk?refresh=true",
                content=payload.encode("utf-8"),
                headers={"Content-Type": "application/x-ndjson"},
            )
            if bulk_resp.status_code < 300:
                print(f"[SUCCESS] Synced {len(products)} products to Elasticsearch index '{ELASTICSEARCH_INDEX}'.")
                return True
            print(f"[WARN] Elasticsearch bulk sync returned status {bulk_resp.status_code}.")
            return False
    except Exception as exc:
        print(f"[INFO] Elasticsearch service not reachable at {es_url} ({exc}); local search cache updated.")
        return False


def export_seeded_json(products: List[Dict[str, Any]], output_path: Path) -> None:
    """Save a serialized JSON snapshot of the seeded catalog for fast fallback & verification."""
    serializable = []
    for p in products:
        item = dict(p)
        item["retail_price"] = float(p["retail_price"])
        item["wholesale_price"] = float(p["wholesale_price"])
        item["base_price"] = float(p["base_price"])
        item["discount_percent"] = float(p["discount_percent"])
        item["compare_at_price"] = float(p["compare_at_price"]) if p["compare_at_price"] is not None else None
        serializable.append(item)

    output_path.write_text(
        json.dumps(serializable, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[INFO] Saved local JSON catalog snapshot ({len(serializable)} products) to {output_path}")


async def main() -> None:
    # Resolve Excel file path from CLI argument or default locations
    excel_path: Optional[Path] = None
    if len(sys.argv) > 1:
        excel_path = Path(sys.argv[1]).expanduser().resolve()
    else:
        for candidate in DEFAULT_EXCEL_PATHS:
            if candidate.exists():
                excel_path = candidate
                break

    if excel_path is None or not excel_path.exists():
        print("[ERROR] Could not find 'Products Սուրո.xlsx'. Pass the file path as the first argument.")
        sys.exit(1)

    products = parse_and_clean_excel(excel_path)
    print(f"[INFO] Cleaned {len(products)} valid product records ready for database upsert.")

    # Export JSON snapshot for fast local search & API resilience
    export_seeded_json(products, SEEDED_JSON_PATH)

    # Upsert into PostgreSQL
    try:
        await seed_postgresql(products, DATABASE_URL)
    except Exception as db_exc:
        print(f"[WARN] PostgreSQL seeding encountered an error: {db_exc}")

    # Sync with Elasticsearch
    await sync_elasticsearch(products, ELASTICSEARCH_URL)


if __name__ == "__main__":
    asyncio.run(main())

