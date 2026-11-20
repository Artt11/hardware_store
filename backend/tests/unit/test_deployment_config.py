"""Audit C2: the Docker seeding path must ship everything the seeder needs and put
extracted images where nginx serves them. Docker is not available in CI here, so the
deployment files themselves are checked."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
BACKEND_DOCKERFILE = (ROOT / "backend" / "Dockerfile").read_text(encoding="utf-8")
FRONTEND_DOCKERFILE = (ROOT / "frontend" / "Dockerfile").read_text(encoding="utf-8")
COMPOSE = yaml.safe_load((ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
NGINX_IMAGES = "/usr/share/nginx/html/images/products"


def test_backend_image_contains_the_translations_workbook() -> None:
    assert "database/product_translations.xlsx" in BACKEND_DOCKERFILE


def test_backend_image_contains_the_catalog_workbook() -> None:
    assert "database/Լավնա.xlsx" in BACKEND_DOCKERFILE


def test_seed_writes_images_into_the_volume_nginx_serves() -> None:
    seed = COMPOSE["services"]["seed"]
    web = COMPOSE["services"]["web"]
    seed_mounts = {m.split(":")[0]: m.split(":")[1] for m in seed["volumes"]}
    web_mounts = {m.split(":")[0]: m.split(":")[1] for m in web["volumes"]}
    shared = set(seed_mounts) & set(web_mounts)

    assert shared, "seed and web must share a volume"
    volume = shared.pop()
    assert volume in COMPOSE["volumes"]
    assert web_mounts[volume] == NGINX_IMAGES
    images_dir = seed_mounts[volume]
    assert "--images-dir" in seed["command"]
    assert seed["command"][seed["command"].index("--images-dir") + 1] == images_dir
    assert "/tmp" not in images_dir  # noqa: S108 - asserting it is NOT used


def test_web_mounts_images_read_only() -> None:
    web_volumes = COMPOSE["services"]["web"]["volumes"]
    assert any(v.endswith(f"{NGINX_IMAGES}:ro") for v in web_volumes)


def test_baked_images_are_writable_by_the_seed_user() -> None:
    # The named volume is initialised from the web image's copy; uid 1001 (backend `app`)
    # must own it or the seeder cannot update photos.
    assert "--chown=1001:1001" in FRONTEND_DOCKERFILE
