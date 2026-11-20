"""Embedded image extraction (Phase 1, Task 3)."""

from io import BytesIO
from pathlib import Path

import openpyxl
from openpyxl.drawing.image import Image as XLImage
from PIL import Image

from app.seed.images import extract_images


def png(color: str) -> XLImage:
    buf = BytesIO()
    Image.new("RGB", (4, 4), color).save(buf, format="PNG")
    buf.seek(0)
    return XLImage(buf)


def make_workbook(tmp_path: Path, anchors: dict[str, str]) -> Path:
    """Header on row 3, products on rows 4+. `anchors` maps cell -> color."""
    wb = openpyxl.Workbook()
    ws = wb.active
    assert ws is not None
    ws.append(["title"])
    ws.append([])
    ws.append(["Կոդ", "Անվանում"])
    for i in range(1, 6):
        ws.append([float(i), f"Ապրանք {i}"])
    for cell, color in anchors.items():
        ws.add_image(png(color), cell)
    path = tmp_path / "with_images.xlsx"
    wb.save(path)
    return path


SKUS = {4: "00001", 5: "00002", 6: "00003", 7: "00004", 8: "00005"}


def test_maps_each_image_to_the_sku_on_its_row(tmp_path: Path) -> None:
    path = make_workbook(tmp_path, {"AD5": "red", "AD7": "blue"})
    out = tmp_path / "out"

    result = extract_images(path, header_row=3, sku_by_row=SKUS, out_dir=out)

    assert result.urls == {"00002": "/images/products/00002.png", "00004": "/images/products/00004.png"}
    assert Image.open(out / "00002.png").getpixel((0, 0)) == (255, 0, 0)
    assert Image.open(out / "00004.png").getpixel((0, 0)) == (0, 0, 255)


def test_image_anchored_on_header_row_belongs_to_first_product(tmp_path: Path) -> None:
    path = make_workbook(tmp_path, {"AD3": "green"})

    result = extract_images(path, header_row=3, sku_by_row=SKUS, out_dir=tmp_path / "out")

    assert result.urls == {"00001": "/images/products/00001.png"}


def test_reports_images_on_rows_without_a_product(tmp_path: Path) -> None:
    path = make_workbook(tmp_path, {"AD20": "red"})

    result = extract_images(path, header_row=3, sku_by_row=SKUS, out_dir=tmp_path / "out")

    assert result.urls == {}
    assert len(result.unmatched) == 1
    assert "row 20" in result.unmatched[0]


def test_reports_second_image_on_same_row_and_keeps_first(tmp_path: Path) -> None:
    path = make_workbook(tmp_path, {"AD5": "red", "AE5": "blue"})
    out = tmp_path / "out"

    result = extract_images(path, header_row=3, sku_by_row=SKUS, out_dir=out)

    assert list(result.urls) == ["00002"]
    assert Image.open(out / "00002.png").getpixel((0, 0)) == (255, 0, 0)
    assert any("duplicate" in u for u in result.unmatched)


def test_workbook_without_drawings_returns_nothing(tmp_path: Path) -> None:
    path = make_workbook(tmp_path, {})

    result = extract_images(path, header_row=3, sku_by_row=SKUS, out_dir=tmp_path / "out")

    assert result.urls == {}
    assert result.unmatched == []


def test_unsafe_sku_never_escapes_output_directory(tmp_path: Path) -> None:
    path = make_workbook(tmp_path, {"AD4": "red"})
    out = tmp_path / "out"

    result = extract_images(path, header_row=3, sku_by_row={4: "../../evil"}, out_dir=out)

    assert result.urls == {}
    assert not (tmp_path / "evil.png").exists()
    assert any("unsafe SKU" in u for u in result.unmatched)
