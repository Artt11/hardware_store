/**
 * Language-aware display of catalog data that arrives in Armenian from the API:
 * money, units of measure, category names, the store city. Pure functions.
 */

export type Lang = 'hy' | 'ru' | 'en';
export const LANGS: Lang[] = ['hy', 'ru', 'en'];

// Thousands separator per language (non-breaking space keeps "4 500" on one line).
const SEPARATORS: Record<Lang, string> = { hy: '\u00a0', ru: '\u00a0', en: ',' };

/** Whole drams: "4 500 ֏" in Armenian, "4 500 AMD" / "4,500 AMD" otherwise. */
export function formatMoney(value: string | number | null | undefined, lang: Lang): string {
  const amount = Math.round(typeof value === 'number' ? value : Number(value ?? 0)) || 0;
  const digits = Math.abs(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, SEPARATORS[lang]);
  return `${amount < 0 ? '-' : ''}${digits}\u00a0${lang === 'hy' ? '֏' : 'AMD'}`;
}

// Every unit present in the catalog (checked against the database), plus "հավաքածու".
const UNITS: Record<string, { ru: string; en: string }> = {
  'հատ': { ru: 'шт', en: 'pcs' },
  'տուփ': { ru: 'уп', en: 'box' },
  'կգ': { ru: 'кг', en: 'kg' },
  'զույգ': { ru: 'пара', en: 'pair' },
  'մ': { ru: 'м', en: 'm' },
  'կոմպլ': { ru: 'компл', en: 'set' },
  'պարկ': { ru: 'мешок', en: 'bag' },
  'բանկա': { ru: 'банка', en: 'jar' },
  'փաթեթ': { ru: 'пачка', en: 'pack' },
  'քառ.մ': { ru: 'м²', en: 'm²' },
  'գծ.մ': { ru: 'пог. м', en: 'lin. m' },
  'խոր.մ': { ru: 'м³', en: 'm³' },
  'հավաքածու': { ru: 'набор', en: 'set' },
  'լ': { ru: 'л', en: 'l' },
};

export function unitLabel(unit: string, lang: Lang): string {
  if (lang === 'hy') return unit;
  return UNITS[unit]?.[lang] ?? unit;
}

// Slugs are fixed in backend/app/seed/categories.py.
const CATEGORIES: Record<string, { ru: string; en: string }> = {
  fasteners: { ru: 'Крепёж', en: 'Fasteners' },
  'cutting-abrasives': { ru: 'Режущий и шлифовальный инструмент', en: 'Cutting & abrasives' },
  'paint-chemicals': { ru: 'Краски и химия', en: 'Paint & chemicals' },
  'hand-tools': { ru: 'Ручной инструмент', en: 'Hand tools' },
  'measuring-tools': { ru: 'Измерительный инструмент', en: 'Measuring tools' },
  safety: { ru: 'Защита и спецодежда', en: 'Safety & workwear' },
  plumbing: { ru: 'Сантехника и трубы', en: 'Plumbing & pipes' },
  electrical: { ru: 'Электротовары', en: 'Electrical' },
  'door-hardware': { ru: 'Дверная фурнитура', en: 'Door hardware' },
  construction: { ru: 'Строительные товары', en: 'Construction supplies' },
  other: { ru: 'Разное', en: 'Other' },
};

export function categoryName(slug: string, lang: Lang, fallback: string): string {
  if (lang === 'hy') return fallback;
  return CATEGORIES[slug]?.[lang] ?? fallback;
}

const CITY: Record<Lang, string> = { hy: 'Երևան', ru: 'Ереван', en: 'Yerevan' };

export const cityName = (lang: Lang): string => CITY[lang];
