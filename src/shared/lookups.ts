// Fixed vocabularies and suggestion lists. Free-text fields (method, grinder, process,
// origins, varieties) accept anything; these lists only seed the pickers.

export type Tone = 'good' | 'warn' | 'bad' | 'blue';

export const STATUSES = [
  { key: 'ordered', label: 'Ordered', icon: '🧾' },
  { key: 'resting', label: 'Resting', icon: '💤' },
  { key: 'freezing', label: 'Freezing', icon: '❄️' },
  { key: 'drinking', label: 'Drinking', icon: '☕️' },
  { key: 'finished', label: 'Finished', icon: '✅' },
] as const;
export type BeanStatus = (typeof STATUSES)[number]['key'];
export const STATUS_KEYS = STATUSES.map((s) => s.key) as [BeanStatus, ...BeanStatus[]];
/** Bags that still hold coffee you could brew. */
export const LIVE_STATUSES: BeanStatus[] = ['resting', 'freezing', 'drinking'];
export const statusOf = (k: string) => STATUSES.find((s) => s.key === k);
/** "received" was retired in v0.3; old rows, backups and clients map to resting. */
export const normalizeStatus = (v: unknown) => (v === 'received' ? 'resting' : v);

export const EXTRACTION = [
  { key: 'under', label: 'Under', long: 'Underextracted', tone: 'warn', tip: 'Grind finer.' },
  {
    key: 'balanced',
    label: 'Balanced',
    long: 'Balanced',
    tone: 'good',
    tip: 'Good! Keep same recipe.',
  },
  { key: 'over', label: 'Over', long: 'Overextracted', tone: 'bad', tip: 'Grind coarser.' },
  {
    key: 'uneven',
    label: 'Uneven',
    long: 'Uneven',
    tone: 'blue',
    tip: 'Pour slower and more evenly.',
  },
] as const satisfies readonly {
  key: string;
  label: string;
  long: string;
  tone: Tone;
  tip: string;
}[];
export type Extraction = (typeof EXTRACTION)[number]['key'];
export const EXTRACTION_KEYS = EXTRACTION.map((e) => e.key) as [Extraction, ...Extraction[]];

export const STRENGTH = [
  { key: 'watery', label: 'Watery' },
  { key: 'balanced', label: 'Balanced' },
  { key: 'muddy', label: 'Muddy' },
] as const;
export type Strength = (typeof STRENGTH)[number]['key'];
export const STRENGTH_KEYS = STRENGTH.map((s) => s.key) as [Strength, ...Strength[]];

export const BUY_AGAIN = [
  { key: 'definitely', label: 'Definitely', tone: 'good' },
  { key: 'yes', label: 'Yes', tone: 'good' },
  { key: 'maybe', label: 'Maybe', tone: 'warn' },
  { key: 'no', label: 'Nah', tone: 'bad' },
] as const satisfies readonly { key: string; label: string; tone: Tone }[];
export type BuyAgain = (typeof BUY_AGAIN)[number]['key'];
export const BUY_AGAIN_KEYS = BUY_AGAIN.map((b) => b.key) as [BuyAgain, ...BuyAgain[]];

export const DEFAULT_METHODS = ['V60', 'Espresso', 'AeroPress', 'Cold Brew'];

export const PROCESSES = [
  'Washed',
  'Natural',
  'Honey',
  'Anaerobic washed',
  'Anaerobic natural',
  'Anaerobic honey',
  'Carbonic maceration',
  'Experimental',
  'Wet-hulled',
  'Unknown',
];

export const FLAGS: Record<string, string> = {
  Bolivia: '🇧🇴',
  Brazil: '🇧🇷',
  Burundi: '🇧🇮',
  China: '🇨🇳',
  Colombia: '🇨🇴',
  'Costa Rica': '🇨🇷',
  'Democratic Republic of the Congo': '🇨🇩',
  Ecuador: '🇪🇨',
  'El Salvador': '🇸🇻',
  Ethiopia: '🇪🇹',
  Guatemala: '🇬🇹',
  Honduras: '🇭🇳',
  India: '🇮🇳',
  Indonesia: '🇮🇩',
  Jamaica: '🇯🇲',
  Kenya: '🇰🇪',
  Mexico: '🇲🇽',
  Myanmar: '🇲🇲',
  Nicaragua: '🇳🇮',
  Panama: '🇵🇦',
  'Papua New Guinea': '🇵🇬',
  Peru: '🇵🇪',
  Rwanda: '🇷🇼',
  Tanzania: '🇹🇿',
  Thailand: '🇹🇭',
  Uganda: '🇺🇬',
  Vietnam: '🇻🇳',
  Yemen: '🇾🇪',
};
export const COUNTRIES = Object.keys(FLAGS);

export const VARIETIES = [
  'Ethiopian Landrace (Heirloom)',
  '74110',
  '74112',
  'Bourbon',
  'Pink Bourbon',
  'Red Bourbon',
  'Castillo',
  'Caturra',
  'Catuai',
  'Gesha',
  'JARC 74158',
  'Pacamara',
  'Pache',
  'SL28',
  'SL34',
  'Sidra',
  'Typica',
];

export const RATIO_PRESETS = [15, 16, 16.67, 17];
export const BAG_PRESETS = [250, 300, 340, 454];
export const TEMP_PRESETS = { F: [195, 198, 201, 205, 208], C: [90, 92, 94, 96, 98] } as const;

/** Values in use first, then suggestions, without duplicates (case-insensitive). */
export function mergeOptions(inUse: Iterable<string>, suggestions: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...inUse, ...suggestions]) {
    const t = v.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

export const flagFor = (country: string) => FLAGS[country.trim()] ?? '';
