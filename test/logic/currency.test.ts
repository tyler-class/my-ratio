import { describe, expect, it } from 'vitest';
import {
  CURRENCIES,
  currencyDigits,
  currencyForLocale,
  isCurrency,
  normalizeCurrency,
  roundMoney,
} from '../../src/shared/currency';
import { brewedAt } from '../../src/shared/logic/dates';

describe('currencies', () => {
  it('offers ten real codes', () => {
    expect(CURRENCIES).toHaveLength(10);
    for (const c of CURRENCIES) expect(isCurrency(c.code)).toBe(true);
  });

  it('knows each currency’s decimals', () => {
    expect(currencyDigits('USD')).toBe(2);
    expect(currencyDigits('JPY')).toBe(0);
    expect(roundMoney(1234.567, 'JPY')).toBe(1235);
    expect(roundMoney(12.345, 'EUR')).toBe(12.35);
  });

  it('reads old free-text settings as codes, falling back to USD', () => {
    expect(normalizeCurrency('usd')).toBe('USD');
    expect(normalizeCurrency(' eur ')).toBe('EUR');
    expect(normalizeCurrency('€')).toBe('EUR');
    expect(normalizeCurrency('£')).toBe('GBP');
    expect(normalizeCurrency('¥')).toBe('JPY');
    expect(normalizeCurrency('A$')).toBe('AUD');
    expect(normalizeCurrency('yen')).toBe('JPY');
    expect(normalizeCurrency('NZD')).toBe('NZD'); // any real code still works
    expect(normalizeCurrency('beans')).toBe('USD');
    expect(normalizeCurrency('')).toBe('USD');
    expect(normalizeCurrency(null)).toBe('USD');
  });

  it('suggests one from the browser’s language', () => {
    expect(currencyForLocale('en-US')).toBe('USD');
    expect(currencyForLocale('en-GB')).toBe('GBP');
    expect(currencyForLocale('de-DE')).toBe('EUR');
    expect(currencyForLocale('fr')).toBe('EUR');
    expect(currencyForLocale('ja')).toBe('JPY');
    expect(currencyForLocale('pt-BR')).toBe('USD');
    expect(currencyForLocale(undefined)).toBe('USD');
  });
});

describe('brew time', () => {
  it('turns the date-time field into an instant', () => {
    const iso = brewedAt('2026-11-09T07:30');
    expect(iso).not.toBeNull();
    const d = new Date(iso!);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2026, 10, 9, 7, 30,
    ]);
    expect(brewedAt('')).toBeNull();
    expect(brewedAt('not a date')).toBeNull();
  });
});
