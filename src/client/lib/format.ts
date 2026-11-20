import { currencyDigits } from '@shared/currency';
import { r1 } from '@shared/logic/units';

const fmts = new Map<string, Intl.NumberFormat>();
function fmt(currency: string, digits: number) {
  const k = `${currency}:${digits}`;
  if (!fmts.has(k)) {
    try {
      fmts.set(
        k,
        new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency,
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }),
      );
    } catch {
      fmts.set(k, new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }));
    }
  }
  return fmts.get(k)!;
}

/** "$12.50", "€12,50" or "¥1,250": the currency's own symbol and decimals. */
export const money = (n: number | null | undefined, currency: string) =>
  n == null ? '–' : fmt(currency, currencyDigits(currency)).format(n);

/** "$", "€", "¥": the symbol a currency shows with. */
export function currencySymbol(currency: string): string {
  return (
    fmt(currency, 0)
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? currency
  );
}
export const money0 = (n: number, currency: string) => fmt(currency, 0).format(Math.round(n));

/** "16.7" from a text input, or null. */
export function parseNum(s: string): number | null {
  const n = Number.parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export const numStr = (n: number | null | undefined) => (n == null ? '' : String(r1(n)));

export const ellipsis = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);

/** Where a currency's symbol goes, for a number being typed: "$" before, or "kr" after. */
export function currencyAffix(currency: string): { prefix?: string; suffix?: string } {
  const parts = fmt(currency, 0).formatToParts(1);
  const at = parts.findIndex((p) => p.type === 'currency');
  const num = parts.findIndex((p) => p.type === 'integer');
  const sym = parts[at]?.value ?? currency;
  return at >= 0 && at < num ? { prefix: sym } : { suffix: sym };
}

/** "1900" as "1,900" (in the reader's format); anything that isn't a plain number stays as is. */
export const groupDigits = (s: string) =>
  /^\d+$/.test(s.trim()) ? Number(s.trim()).toLocaleString() : s;
