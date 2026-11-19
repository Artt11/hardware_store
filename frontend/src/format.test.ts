import { describe, expect, it } from 'vitest';
import { categoryName, cityName, formatMoney, unitLabel } from './format';

const spaces = (s: string) => s.replace(/[  ]/g, ' ');

describe('formatMoney', () => {
  it('uses the dram sign in Armenian', () => {
    expect(spaces(formatMoney('4500.00', 'hy'))).toBe('4 500 ֏');
  });

  it('uses AMD in Russian and English', () => {
    expect(spaces(formatMoney('4500.00', 'ru'))).toBe('4 500 AMD');
    expect(spaces(formatMoney('4500.00', 'en'))).toBe('4,500 AMD');
  });

  it('accepts numbers and empty values', () => {
    expect(spaces(formatMoney(0, 'en'))).toBe('0 AMD');
    expect(spaces(formatMoney(null, 'en'))).toBe('0 AMD');
    expect(spaces(formatMoney('121500.00', 'hy'))).toBe('121 500 ֏');
  });
});

describe('unitLabel', () => {
  it('translates every unit used in the catalog', () => {
    expect(unitLabel('հատ', 'ru')).toBe('шт');
    expect(unitLabel('տուփ', 'en')).toBe('box');
    expect(unitLabel('քառ.մ', 'en')).toBe('m²');
    expect(unitLabel('լ', 'ru')).toBe('л');
  });

  it('keeps Armenian and unknown units unchanged', () => {
    expect(unitLabel('հատ', 'hy')).toBe('հատ');
    expect(unitLabel('նոր միավոր', 'en')).toBe('նոր միավոր');
  });
});

describe('categoryName', () => {
  it('translates by slug and falls back to the server name', () => {
    expect(categoryName('hand-tools', 'ru', 'Ձեռքի գործիքներ')).toBe('Ручной инструмент');
    expect(categoryName('hand-tools', 'hy', 'Ձեռքի գործիքներ')).toBe('Ձեռքի գործիքներ');
    expect(categoryName('new-category', 'en', 'Նոր բաժին')).toBe('Նոր բաժին');
  });
});

describe('cityName', () => {
  it('translates Yerevan', () => {
    expect(cityName('en')).toBe('Yerevan');
    expect(cityName('ru')).toBe('Ереван');
    expect(cityName('hy')).toBe('Երևան');
  });
});
