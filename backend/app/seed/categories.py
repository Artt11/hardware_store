"""Product categories. The workbook's `Խումբ` column is empty, so categories are
inferred from Armenian keywords in the product name.

Rule: the longest matching keyword wins, so "պտուտակահան" (screwdriver) beats
"պտուտակ" (screw). Ties go to the category listed first."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class CategoryDef:
    slug: str
    name: str
    keywords: tuple[str, ...]


CATEGORIES: tuple[CategoryDef, ...] = (
    CategoryDef("fasteners", "Ամրակման միջոցներ",
                ("պտուտակ", "բոլտ", "գայկա", "շայբա", "դյուբել", "մեխ", "անգեր", "խաչուկ", "ամրակ",
                 "ամրացում")),
    CategoryDef("cutting-abrasives", "Կտրող և հղկող գործիքներ",
                ("շաղափ", "սկավառակ", "դիսկ", "կտրող", "կտրիչ", "հղկող", "հղկաթուղթ", "բուր", "գայլիկոն",
                 "ֆրեզ", "սղոց", "նաժովկա", "կորոնկա")),
    CategoryDef("paint-chemicals", "Ներկարարական և քիմիա",
                ("սիլիկոն", "փրփուր", "ներկ", "լաք", "սոսինձ", "ժապավեն", "սկոչ", "վալիկ", "վրձին",
                 "խոզանակ", "հերմետիկ", "գունանյութ", "էմուլսիա", "այծաթաղանթ")),
    CategoryDef("hand-tools", "Ձեռքի գործիքներ",
                ("բանալի", "մուրճ", "պտուտակահան", "աքցան", "հարթաշուրթ", "մկրատ", "գործիք", "գլխիկ",
                 "դանակ", "ծեփիչ", "մածկաթիակ", "սեղմիչ", "քերիչ", "հատիչ", "հարիչ", "շեստիգրաննիկ")),
    CategoryDef("measuring-tools", "Չափիչ գործիքներ",
                ("մետր", "հարթաչափ", "չափիչ", "անկյունակ", "լազեր", "ռուլետկա")),
    CategoryDef("safety", "Անվտանգություն և հանդերձանք",
                ("ձեռնոց", "ակնոց", "սաղավարտ", "դիմակ", "կոշիկ")),
    CategoryDef("plumbing", "Սանտեխնիկա և խողովակներ",
                ("ծորակ", "խողովակ", "փական", "սանտեխ", "ցնցուղ", "ֆիլտր", "սիֆոն", "խամութ", "անցում",
                 "զուգարանակոնք", "ջրաբաշխիչ", "ամերիկյան")),
    CategoryDef("electrical", "Էլեկտրական ապրանքներ",
                ("լամպ", "մալուխ", "վարդակ", "անջատիչ", "էլեկտր", "մարտկոց", "լուսարձակ", "էլեմենտ",
                 "եռաբաշխիչ")),
    CategoryDef("door-hardware", "Դռան ֆուրնիտուր",
                ("կողպեք", "պետլի", "բռնիչ", "միջուկ")),
    CategoryDef("construction", "Շինարարական պարագաներ",
                ("դույլ", "սայլակ", "բահ", "քլունգ", "ավել", "մայակ", "պրոֆիլ", "ուգոլնիկ", "պարան",
                 "ամրալար")),
)

OTHER = CategoryDef("other", "Այլ", ())
ALL_CATEGORIES: tuple[CategoryDef, ...] = (*CATEGORIES, OTHER)


def infer_category(name: str) -> CategoryDef:
    lowered = name.lower()
    best: CategoryDef = OTHER
    best_len = 0
    for category in CATEGORIES:
        for keyword in category.keywords:
            if len(keyword) > best_len and keyword in lowered:
                best, best_len = category, len(keyword)
    return best
