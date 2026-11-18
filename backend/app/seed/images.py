"""Extract product photos embedded in the first worksheet of an .xlsx file.

Follows the OOXML relationship chain (workbook -> sheet -> drawing -> media) rather
than assuming file names. Each image's top-left anchor row selects the product row.
"""

import posixpath
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from defusedxml import ElementTree as ET

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}
R_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
R_EMBED = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
SAFE_SKU = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
PUBLIC_PREFIX = "/images/products"


@dataclass(slots=True)
class ImageResult:
    urls: dict[str, str] = field(default_factory=dict)
    unmatched: list[str] = field(default_factory=list)


def extract_images(path: Path, *, header_row: int, sku_by_row: dict[int, str], out_dir: Path) -> ImageResult:
    """`header_row` and `sku_by_row` keys are 1-based worksheet rows."""
    result = ImageResult()
    with zipfile.ZipFile(path) as zf:
        drawing = _first_sheet_drawing(zf)
        if drawing is None:
            return result
        media_by_rid = _relationships(zf, drawing)
        root = ET.fromstring(zf.read(drawing))
        out_dir.mkdir(parents=True, exist_ok=True)
        base = out_dir.resolve()

        for anchor in root:
            if not anchor.tag.endswith("Anchor"):
                continue
            start = anchor.find("xdr:from/xdr:row", NS)
            blip = anchor.find(".//a:blip", NS)
            if start is None or start.text is None or blip is None:
                continue
            # A picture whose top edge sits in the header belongs to the first product row.
            row = max(int(start.text) + 1, header_row + 1)
            media = media_by_rid.get(blip.get(R_EMBED, ""))
            sku = sku_by_row.get(row)
            if media is None:
                result.unmatched.append(f"row {row}: image relationship not found")
                continue
            if sku is None:
                result.unmatched.append(f"row {row}: image has no product on its row ({media})")
                continue
            if not SAFE_SKU.match(sku):
                result.unmatched.append(f"row {row}: unsafe SKU {sku!r}, image skipped")
                continue
            if sku in result.urls:
                result.unmatched.append(f"row {row}: duplicate image for SKU {sku}, kept first")
                continue
            ext = posixpath.splitext(media)[1].lower()
            if ext not in ALLOWED_EXTENSIONS:
                result.unmatched.append(f"row {row}: unsupported image type {ext}")
                continue
            target = (base / f"{sku}{ext}").resolve()
            if target.parent != base:
                result.unmatched.append(f"row {row}: path escapes output directory")
                continue
            target.write_bytes(zf.read(media))
            result.urls[sku] = f"{PUBLIC_PREFIX}/{target.name}"
    return result


def _relationships(zf: zipfile.ZipFile, part: str) -> dict[str, str]:
    """Map relationship id -> absolute part name for `part`."""
    folder, name = posixpath.split(part)
    rels_name = posixpath.join(folder, "_rels", f"{name}.rels")
    if rels_name not in zf.namelist():
        return {}
    rels: dict[str, str] = {}
    for rel in ET.fromstring(zf.read(rels_name)).findall("pr:Relationship", NS):
        target = rel.get("Target", "")
        if rel.get("TargetMode") == "External" or not target:
            continue
        resolved = target.lstrip("/") if target.startswith("/") else posixpath.normpath(
            posixpath.join(folder, target)
        )
        rels[rel.get("Id", "")] = resolved
    return rels


def _first_sheet_drawing(zf: zipfile.ZipFile) -> str | None:
    workbook = "xl/workbook.xml"
    first_sheet = ET.fromstring(zf.read(workbook)).find("main:sheets/main:sheet", NS)
    if first_sheet is None:
        return None
    sheet = _relationships(zf, workbook).get(first_sheet.get(R_ID, ""))
    if sheet is None:
        return None
    drawing_el = ET.fromstring(zf.read(sheet)).find("main:drawing", NS)
    if drawing_el is None:
        return None
    return _relationships(zf, sheet).get(drawing_el.get(R_ID, ""))
