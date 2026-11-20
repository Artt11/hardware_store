import pytest

from app.seed.categories import ALL_CATEGORIES, infer_category


@pytest.mark.parametrize(
    ("name", "slug"),
    [
        ("Պտուտակահան խաչաձև PH2", "hand-tools"),  # contains "պտուտակ": longest keyword must win
        ("Պտուտակ 4x40", "fasteners"),
        ("Էլեմենտ AA 1.5V", "electrical"),
        ("Կողպեք դռան", "door-hardware"),
        ("Դույլ 12լ", "construction"),
        ("Ռուլետկա 5մ", "measuring-tools"),
        ("Խամութ 20-32", "plumbing"),
        ("Հղկաթուղթ P120", "cutting-abrasives"),
        ("Անկյունակ 300մմ", "measuring-tools"),
        ("Զամբյուղ", "other"),
    ],
)
def test_infers_category_from_name(name: str, slug: str) -> None:
    assert infer_category(name).slug == slug


def test_category_slugs_are_unique() -> None:
    slugs = [c.slug for c in ALL_CATEGORIES]
    assert len(slugs) == len(set(slugs))
