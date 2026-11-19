"""Reading the product translations workbook."""

from pathlib import Path

import openpyxl
import pytest

from app.seed.translations import HEADERS, read_translations


def make(tmp_path: Path, rows: list[list[object]]) -> Path:
    wb = openpyxl.Workbook()
    ws = wb.active
    assert ws is not None
    ws.append(list(HEADERS))
    for r in rows:
        ws.append(r)
    path = tmp_path / "t.xlsx"
    wb.save(path)
    return path


def test_reads_translations_by_sku(tmp_path: Path) -> None:
    path = make(tmp_path, [["00001", "Մուրճ", "Молоток", "Hammer"], [3.0, "Ներկ", "Краска", "Paint"]])

    result = read_translations(path)

    assert result == {"00001": ("Молоток", "Hammer"), "00003": ("Краска", "Paint")}


def test_blank_cells_become_none_and_whitespace_is_trimmed(tmp_path: Path) -> None:
    result = read_translations(make(tmp_path, [["00001", "Մուրճ", "  ", " Hammer  "]]))
    assert result == {"00001": (None, "Hammer")}


def test_wrong_header_is_rejected(tmp_path: Path) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    assert ws is not None
    ws.append(["code", "name"])
    path = tmp_path / "bad.xlsx"
    wb.save(path)
    with pytest.raises(ValueError, match="header"):
        read_translations(path)
