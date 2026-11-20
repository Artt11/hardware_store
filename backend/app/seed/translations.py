"""Product name translations: backend/database/product_translations.xlsx.

One row per product: SKU | Հայերեն | Русский | English. The Armenian column is for
reference only (the source of truth stays Լավնա.xlsx). Edit the Russian/English
cells and re-run `python -m app.seed.run` to update the site.
"""

from pathlib import Path

import openpyxl

from app.seed.excel import RowError, _clean_text, _parse_sku

HEADERS = ("SKU", "Հայերեն", "Русский", "English")
Translations = dict[str, tuple[str | None, str | None]]


def read_translations(path: Path) -> Translations:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        rows = wb.worksheets[0].iter_rows(values_only=True)
        header = tuple(str(v).strip() if v is not None else "" for v in next(rows, ()))
        if header[: len(HEADERS)] != HEADERS:
            raise ValueError(f"Unexpected header {header!r}; expected {HEADERS!r}")
        result: Translations = {}
        for values in rows:
            if not values or values[0] is None:
                continue
            try:
                sku = _parse_sku(values[0])
            except RowError:
                continue
            ru = _clean_text(values[2]) if len(values) > 2 else None
            en = _clean_text(values[3]) if len(values) > 3 else None
            result[sku] = (ru, en)
        return result
    finally:
        wb.close()


def write_translations(path: Path, rows: list[tuple[str, str, str | None, str | None]]) -> None:
    """Write (sku, armenian, russian, english) rows with a frozen, wide header."""
    wb = openpyxl.Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = "Translations"
    ws.append(list(HEADERS))
    for row in rows:
        ws.append(list(row))
    ws.freeze_panes = "A2"
    for column, width in zip("ABCD", (10, 60, 60, 60), strict=True):
        ws.column_dimensions[column].width = width
    wb.save(path)
