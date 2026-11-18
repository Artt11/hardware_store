"""Parse the Lavna product workbook into validated rows. Pure: no DB, no file writes."""

import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import openpyxl

from app.seed.categories import infer_category

COL_SKU = "Կոդ"
COL_NAME = "Անվանում"
COL_UNIT = "Չափման միավոր"
COL_GROUP = "Խումբ"
COL_WHOLESALE = "Մեծածախ գին դրամով"
COL_RETAIL = "Մանրածախ գին դրամով"
COL_DESCRIPTION = "Բնութագիր"
COL_BARCODE = "Գծիկավոր կոդ"
COL_DISCOUNT = "Զեղչ (%)"
COL_VAT = "ԱԱՀ"
COL_FULL_NAME = "Լրիվ անվանում"
COL_CLOSED = "Փակված"

REQUIRED_COLUMNS = (COL_SKU, COL_NAME, COL_RETAIL)
TRUE_VALUES = {"true", "истина", "1", "այո", "yes"}
FALSE_VALUES = {"false", "ложь", "0", "ոչ", "no", ""}
SKU_WIDTH = 5
DEFAULT_UNIT = "հատ"
CENTS = Decimal("0.01")


class RowError(ValueError):
    """A single row cannot be imported."""


@dataclass(frozen=True, slots=True)
class ProductRow:
    row_number: int
    sku: str
    name: str
    unit_of_measure: str
    category_slug: str
    retail_price: Decimal
    wholesale_price: Decimal
    discount_percent: Decimal
    barcode: str | None
    description: str | None
    vat_applicable: bool
    is_active: bool


@dataclass(frozen=True, slots=True)
class RowIssue:
    row_number: int
    reason: str


@dataclass(slots=True)
class ParseResult:
    header_row: int
    products: list[ProductRow] = field(default_factory=list)
    skipped: list[RowIssue] = field(default_factory=list)
    warnings: list[RowIssue] = field(default_factory=list)


def parse_workbook(path: Path) -> ParseResult:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        ws = wb.worksheets[0]
        rows = ws.iter_rows(values_only=True)
        header_row, columns = _find_header(rows)
        result = ParseResult(header_row=header_row)
        seen: set[str] = set()
        for offset, values in enumerate(rows, start=1):
            row_number = header_row + offset
            if not values or all(v is None or str(v).strip() == "" for v in values):
                continue
            try:
                product = _parse_row(row_number, values, columns)
            except RowError as exc:
                result.skipped.append(RowIssue(row_number, str(exc)))
                continue
            if product.sku in seen:
                result.skipped.append(RowIssue(row_number, f"duplicate SKU {product.sku}"))
                continue
            seen.add(product.sku)
            if product.retail_price == 0:
                result.warnings.append(RowIssue(row_number, f"zero retail price, SKU {product.sku} inactive"))
            result.products.append(product)
        return result
    finally:
        wb.close()


def _find_header(rows: Any) -> tuple[int, dict[str, int]]:
    for row_number, values in enumerate(rows, start=1):
        names = [str(v).strip() if v is not None else "" for v in (values or ())]
        if COL_SKU in names and COL_NAME in names:
            columns = {name: idx for idx, name in enumerate(names) if name}
            missing = [c for c in REQUIRED_COLUMNS if c not in columns]
            if missing:
                raise ValueError(f"Header row {row_number} is missing columns: {', '.join(missing)}")
            return row_number, columns
    raise ValueError(f"No header row containing {COL_SKU!r} and {COL_NAME!r} found")


def _parse_row(row_number: int, values: tuple[Any, ...], columns: dict[str, int]) -> ProductRow:
    def cell(name: str) -> Any:
        idx = columns.get(name)
        return values[idx] if idx is not None and idx < len(values) else None

    sku = _parse_sku(cell(COL_SKU))
    name = _clean_text(cell(COL_NAME)) or _clean_text(cell(COL_FULL_NAME))
    if not name:
        raise RowError("missing name")
    retail = _parse_money(cell(COL_RETAIL), COL_RETAIL)
    wholesale = _parse_money(cell(COL_WHOLESALE), COL_WHOLESALE)
    discount = _parse_money(cell(COL_DISCOUNT), COL_DISCOUNT)
    if discount > 100:
        raise RowError(f"invalid discount {discount}")

    description = _clean_text(cell(COL_DESCRIPTION))
    full_name = _clean_text(cell(COL_FULL_NAME))
    if not description and full_name and full_name != name:
        description = full_name

    group = _clean_text(cell(COL_GROUP))
    category = infer_category(group or name)
    closed = _parse_bool(cell(COL_CLOSED), default=False)

    return ProductRow(
        row_number=row_number,
        sku=sku,
        name=name[:500],
        unit_of_measure=_clean_text(cell(COL_UNIT)) or DEFAULT_UNIT,
        category_slug=category.slug,
        retail_price=retail,
        wholesale_price=wholesale,
        discount_percent=discount,
        barcode=_parse_barcode(cell(COL_BARCODE)),
        description=description,
        vat_applicable=_parse_bool(cell(COL_VAT), default=True),
        is_active=not closed and retail > 0,
    )


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def _parse_sku(value: Any) -> str:
    if value is None or str(value).strip() == "":
        raise RowError("missing SKU")
    if isinstance(value, float):
        if not value.is_integer():
            raise RowError(f"invalid SKU {value}")
        value = int(value)
    text = str(value).strip()
    if text.endswith(".0") and text[:-2].isdigit():
        text = text[:-2]
    return text.zfill(SKU_WIDTH) if text.isdigit() else text


def _parse_money(value: Any, column: str) -> Decimal:
    if value is None or (isinstance(value, str) and value.strip() == ""):
        return Decimal("0.00")
    if isinstance(value, bool):
        raise RowError(f"invalid price in {column}")
    try:
        text = str(value).replace(" ", "").replace(" ", "").replace(",", ".")
        amount = Decimal(text).quantize(CENTS)
    except InvalidOperation as exc:
        raise RowError(f"invalid price in {column}: {value!r}") from exc
    if amount < 0:
        raise RowError(f"negative price in {column}: {amount}")
    return amount


def _parse_bool(value: Any, *, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in TRUE_VALUES:
        return True
    if text in FALSE_VALUES:
        return False
    return default


def _parse_barcode(value: Any) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, float):
        value = int(value) if value.is_integer() else value
    text = str(value).strip()
    return None if text in ("", "0") else text[:128]
