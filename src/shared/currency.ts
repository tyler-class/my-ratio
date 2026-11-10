// Currencies: the ten most traded (BIS triennial survey), formatted with Intl so each shows
// its own symbol and decimals (¥1,200, not ¥1,200.00). Any other valid ISO code still works.

export const CURRENCIES = [
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'GBP', name: 'British pound' },
  { code: 'CNY', name: 'Chinese yuan' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'HKD', name: 'Hong Kong dollar' },
  { code: 'SGD', name: 'Singapore dollar' },
] as const;

export const DEFAULT_CURRENCY = 'USD';

// Intl formats any three letters as a "currency", so check against its list of real ones.
const KNOWN: Set<string> = (() => {
  try {
    return new Set(
      (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('currency'),
    );
  } catch {
    return new Set(CURRENCIES.map((c) => c.code));
  }
})();

/** A real ISO 4217 code, like USD. */
export function isCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code) && (KNOWN.has(code) || CURRENCIES.some((c) => c.code === code));
}

const ALIASES: Record<string, string> = {
  $: 'USD',
  US$: 'USD',
  DOLLAR: 'USD',
  DOLLARS: 'USD',
  '€': 'EUR',
  EURO: 'EUR',
  EUROS: 'EUR',
  '£': 'GBP',
  POUND: 'GBP',
  POUNDS: 'GBP',
  '¥': 'JPY',
  円: 'JPY',
  YEN: 'JPY',
  'CN¥': 'CNY',
  RMB: 'CNY',
  YUAN: 'CNY',
  元: 'CNY',
  A$: 'AUD',
  AU$: 'AUD',
  C$: 'CAD',
  CA$: 'CAD',
  FR: 'CHF',
  'FR.': 'CHF',
  HK$: 'HKD',
  S$: 'SGD',
  SG$: 'SGD',
};

/**
 * A stored or typed currency as an ISO code: codes in any case, symbols ("€", "A$") and names
 * ("euro", "yen") are understood; anything else falls back to USD.
 */
export function normalizeCurrency(v: string | null | undefined): string {
  const t = (v ?? '').trim().toUpperCase();
  if (!t) return DEFAULT_CURRENCY;
  if (ALIASES[t]) return ALIASES[t];
  return isCurrency(t) ? t : DEFAULT_CURRENCY;
}

/** How many decimals a currency uses: 2 for USD, 0 for JPY. */
export function currencyDigits(code: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

const EURO_REGIONS = new Set(
  'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK'.split(' '),
);
const REGION: Record<string, string> = {
  US: 'USD',
  GB: 'GBP',
  JP: 'JPY',
  CN: 'CNY',
  AU: 'AUD',
  CA: 'CAD',
  CH: 'CHF',
  LI: 'CHF',
  HK: 'HKD',
  SG: 'SGD',
};

/** The currency a browser's language suggests ("en-GB" → GBP, "de-DE" → EUR), else USD. */
export function currencyForLocale(locale: string | undefined): string {
  if (!locale) return DEFAULT_CURRENCY;
  let region: string | undefined;
  try {
    region = new Intl.Locale(locale).maximize().region;
  } catch {
    region = undefined;
  }
  if (!region) return DEFAULT_CURRENCY;
  if (EURO_REGIONS.has(region)) return 'EUR';
  return REGION[region] ?? DEFAULT_CURRENCY;
}

/** A price typed in a field, rounded to the currency's decimals. */
export function roundMoney(n: number, code: string): number {
  const f = 10 ** currencyDigits(code);
  return Math.round(n * f) / f;
}
