"""Excel catalog parsing (Phase 1, Task 2). Uses real generated workbooks."""

from decimal import Decimal
from pathlib import Path
from typing import Any

import openpyxl
import pytest

from app.seed.excel import parse_workbook

HEADER = [
    "Կոդ",
    "Անվանում",
    "Չափման միավոր",
    "Խումբ",
    "ԱՏԳԱԱ դասակարգիչ",
    "Հաշիվ",
    None,
    "Մեծածախ գին դրամով",
    "Մանրածախ գին դրամով",
    "Բնութագիր",
    "Գծիկավոր կոդ",
    "Արտաքին կոդ",
    "Հաշվառման մեթոդ",
    "ՀԾԲ գործակից",
    "Զեղչ (%)",
    "Բնապահպանական հարկի %",
    "Նվազագույն քանակ (min)",
    "Առավելագույն քանակ (max)",
    "ԱԱՀ",
    "Լրիվ անվանում",
]


def row(**values: Any) -> list[Any]:
    defaults: dict[str, Any] = {
        "Կոդ": 1.0,
        "Անվանում": "Պտուտակ 4x40",
        "Չափման միավոր": "հատ",
        "Մեծածախ գին դրամով": 0.0,
        "Մանրածախ գին դրամով": 150.0,
        "Գծիկավոր կոդ": None,
        "Զեղչ (%)": 0.0,
        "ԱԱՀ": "ИСТИНА",
        "Բնութագիր": None,
    }
    defaults.update(values)
    return [defaults.get(h) if h else None for h in HEADER]


def make_workbook(tmp_path: Path, rows: list[list[Any]], *, title_rows: int = 2) -> Path:
    wb = openpyxl.Workbook()
    ws = wb.active
    assert ws is not None
    ws.append(["Նյութական արժեքներ"])
    for _ in range(title_rows - 1):
        ws.append([])
    ws.append(HEADER)
    for r in rows:
        ws.append(r)
    path = tmp_path / "catalog.xlsx"
    wb.save(path)
    return path


def test_finds_header_by_column_names_not_fixed_position(tmp_path: Path) -> None:
    path = make_workbook(tmp_path, [row()], title_rows=5)

    result = parse_workbook(path)

    assert len(result.products) == 1
    assert result.header_row == 6


def test_normalizes_float_sku_to_five_digits(tmp_path: Path) -> None:
    result = parse_workbook(make_workbook(tmp_path, [row(**{"Կոդ": 7.0})]))

    assert result.products[0].sku == "00007"


def test_keeps_skus_longer_than_five_digits(tmp_path: Path) -> None:
    result = parse_workbook(make_workbook(tmp_path, [row(**{"Կոդ": 123456.0})]))

    assert result.products[0].sku == "123456"


def test_parses_prices_as_decimal(tmp_path: Path) -> None:
    result = parse_workbook(
        make_workbook(tmp_path, [row(**{"Մանրածախ գին դրամով": 1250.5, "Մեծածախ գին դրամով": 1100.0})])
    )

    product = result.products[0]
    assert product.retail_price == Decimal("1250.50")
    assert product.wholesale_price == Decimal("1100.00")


def test_parses_russian_excel_booleans(tmp_path: Path) -> None:
    result = parse_workbook(make_workbook(tmp_path, [row(**{"ԱԱՀ": "ЛОЖЬ"})]))

    assert result.products[0].vat_applicable is False


def test_converts_float_barcode_to_digit_string(tmp_path: Path) -> None:
    result = parse_workbook(make_workbook(tmp_path, [row(**{"Գծիկավոր կոդ": 4607001234567.0})]))

    assert result.products[0].barcode == "4607001234567"


def test_collapses_whitespace_in_names(tmp_path: Path) -> None:
    result = parse_workbook(make_workbook(tmp_path, [row(**{"Անվանում": "  Մուրճ   500գ  "})]))

    assert result.products[0].name == "Մուրճ 500գ"


def test_infers_category_from_name_when_group_is_empty(tmp_path: Path) -> None:
    result = parse_workbook(make_workbook(tmp_path, [row(**{"Անվանում": "Մուրճ 500գ"})]))

    assert result.products[0].category_slug == "hand-tools"


def test_unknown_names_fall_into_other_category(tmp_path: Path) -> None:
    result = parse_workbook(make_workbook(tmp_path, [row(**{"Անվանում": "Զամբյուղ"})]))

    assert result.products[0].category_slug == "other"


def test_zero_retail_price_is_imported_inactive_with_warning(tmp_path: Path) -> None:
    result = parse_workbook(make_workbook(tmp_path, [row(**{"Մանրածախ գին դրամով": 0.0})]))

    assert result.products[0].is_active is False
    assert any("zero retail price" in w.reason for w in result.warnings)


@pytest.mark.parametrize(
    ("values", "reason"),
    [
        ({"Կոդ": None}, "missing SKU"),
        ({"Անվանում": "   "}, "missing name"),
        ({"Մանրածախ գին դրամով": -5.0}, "negative price"),
        ({"Մանրածախ գին դրամով": "abc"}, "invalid price"),
    ],
)
def test_rejects_invalid_rows_with_reason(tmp_path: Path, values: dict[str, Any], reason: str) -> None:
    result = parse_workbook(make_workbook(tmp_path, [row(**values)]))

    assert result.products == []
    assert len(result.skipped) == 1
    assert reason in result.skipped[0].reason
    assert result.skipped[0].row_number == 4


def test_rejects_duplicate_sku_and_keeps_first(tmp_path: Path) -> None:
    result = parse_workbook(
        make_workbook(tmp_path, [row(**{"Անվանում": "Առաջին"}), row(**{"Անվանում": "Երկրորդ"})])
    )

    assert [p.name for p in result.products] == ["Առաջին"]
    assert "duplicate SKU" in result.skipped[0].reason


def test_ignores_fully_empty_rows(tmp_path: Path) -> None:
    result = parse_workbook(make_workbook(tmp_path, [row(), [None] * len(HEADER)]))

    assert len(result.products) == 1
    assert result.skipped == []


def test_missing_required_column_raises(tmp_path: Path) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    assert ws is not None
    ws.append(["Կոդ", "Անվանում"])
    path = tmp_path / "bad.xlsx"
    wb.save(path)

    with pytest.raises(ValueError, match="Մանրածախ գին դրամով"):
        parse_workbook(path)
