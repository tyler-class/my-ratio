// Each grinder has its own grind scale: which settings exist and how one step moves.
//
// Any numbered dial is "A to B with N steps between each number": the Encore is 1 to 40 with 0
// between, the Fellow Ode 1 to 11 with 2 between (1, 1.1, 1.2, 2 …), the Opus 1 to 11 with 3.
// A stepless dial is 9 between: one decimal, .0 to .9. A setting is written as the number, a
// point and the step: one digit when there are up to 9 steps between, two (4.05, 4.10) from 10
// on, so a grinder's settings never clash. Anything else (multi-turn dials, odd markings) is a
// write-in: the setting is free text.

export type GrindScale =
  { kind: 'steps'; min: number; max: number; between: number } | { kind: 'text' };
export type StepScale = Extract<GrindScale, { kind: 'steps' }>;

/** The most steps a scale can have between two numbers (two digits). */
export const MAX_BETWEEN = 99;
/** "Stepless": one decimal. */
export const STEPLESS_BETWEEN = 9;

export interface GrinderPreset {
  name: string;
  scale: GrindScale;
  /** How the dial reads, in a few words. */
  note: string;
  /** Other ways people write its name. */
  aliases?: string[];
}

/** Known grinders and how their dials step (researched from makers' manuals, Nov 2026). */
export const GRINDER_PRESETS: GrinderPreset[] = [
  {
    name: 'Fellow Ode (Gen 2)',
    scale: { kind: 'steps', min: 1, max: 11, between: 2 },
    note: 'Numbered 1 to 11, with 2 unmarked clicks between each number.',
    aliases: ['Fellow Ode Gen 2', 'Ode Gen 2', 'Ode 2'],
  },
  {
    name: 'Fellow Ode (Gen 1)',
    scale: { kind: 'steps', min: 1, max: 11, between: 2 },
    note: 'Numbered 1 to 11, with 2 unmarked clicks between each number.',
    aliases: ['Fellow Ode', 'Fellow Ode Gen 1', 'Ode', 'Ode Gen 1'],
  },
  {
    name: 'Fellow Opus',
    scale: { kind: 'steps', min: 1, max: 11, between: 3 },
    note: 'Numbered 1 to 11, with 3 marks between each number.',
    aliases: ['Opus'],
  },
  {
    name: 'Baratza Encore',
    scale: { kind: 'steps', min: 1, max: 40, between: 0 },
    note: 'Numbered 1 to 40.',
    aliases: ['Encore', 'Baratza Encore ESP', 'Encore ESP'],
  },
  {
    name: 'Baratza Virtuoso+',
    scale: { kind: 'steps', min: 1, max: 40, between: 0 },
    note: 'Numbered 1 to 40.',
    aliases: ['Virtuoso', 'Baratza Virtuoso'],
  },
  {
    name: 'Comandante C40',
    scale: { kind: 'steps', min: 0, max: 50, between: 0 },
    note: 'No numbers: turn it fine until the burrs touch, then count clicks back out.',
    aliases: ['Comandante', 'C40'],
  },
  {
    name: '1Zpresso J-Max',
    scale: { kind: 'text' },
    note: 'Written as turn, number and click, like 1.3.2.',
    aliases: ['J-Max', 'JMax'],
  },
  {
    name: '1Zpresso JX-Pro',
    scale: { kind: 'text' },
    note: 'Written as turn, number and click, like 1.3.2.',
    aliases: ['JX-Pro', 'JX Pro'],
  },
  {
    name: '1Zpresso K-Ultra',
    scale: { kind: 'text' },
    note: 'Written as turn, number and click, like 1.3.2.',
    aliases: ['K-Ultra', 'K Ultra'],
  },
  {
    name: 'Kingrinder K6',
    scale: { kind: 'steps', min: 0, max: 240, between: 0 },
    note: 'Turn it fine until the burrs touch, then count clicks back out (60 a turn).',
    aliases: ['K6'],
  },
  {
    name: 'Niche Zero',
    scale: { kind: 'steps', min: 0, max: 50, between: 9 },
    note: 'Turns smoothly, marked 0 to 50: anything in between, like 14.5.',
    aliases: ['Niche'],
  },
  {
    name: 'DF64',
    scale: { kind: 'steps', min: 0, max: 90, between: 9 },
    note: 'Turns smoothly, marked 0 to 90: anything in between, like 12.5.',
    aliases: ['Turin DF64', 'DF64 Gen 2'],
  },
  {
    name: 'Timemore C2',
    scale: { kind: 'steps', min: 0, max: 36, between: 0 },
    note: 'No numbers: turn it fine until the burrs touch, then count clicks back out.',
  },
  {
    name: 'Timemore C3',
    scale: { kind: 'steps', min: 0, max: 36, between: 0 },
    note: 'No numbers: turn it fine until the burrs touch, then count clicks back out.',
    aliases: ['Timemore C3S'],
  },
  {
    name: 'Eureka Mignon Specialita',
    scale: { kind: 'steps', min: 0, max: 9, between: 9 },
    note: 'Turns smoothly; the numbers are reference marks, so anything in between works.',
    aliases: ['Mignon Specialita', 'Eureka Specialita'],
  },
  {
    name: 'Wilfa Uniform',
    scale: { kind: 'steps', min: 1, max: 41, between: 0 },
    note: 'Numbered 1 to 41.',
  },
];

/** Grinder names A to Z (case doesn't matter), wherever they're listed. */
export const byName = (list: string[]) =>
  [...list].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));

/** A grinder that isn't a known one, until its owner sets its scale: 1 to 10, one decimal. */
export const DEFAULT_SCALE: StepScale = {
  kind: 'steps',
  min: 1,
  max: 10,
  between: STEPLESS_BETWEEN,
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** The preset a grinder's name matches, if any ("Ode Gen 2" finds the Fellow Ode Gen 2). */
export function presetFor(name: string | null | undefined): GrinderPreset | undefined {
  if (!name) return undefined;
  const n = norm(name);
  const names = (p: GrinderPreset) => [p.name, ...(p.aliases ?? [])].map(norm);
  return (
    GRINDER_PRESETS.find((p) => names(p).includes(n)) ??
    // Longest name first, so "Ode Gen 2" beats "Ode".
    [...GRINDER_PRESETS]
      .sort((a, b) => b.name.length - a.name.length)
      .find((p) => names(p).some((x) => n.includes(x) || x.endsWith(' ' + n)))
  );
}

/** Whether a stored value is a usable scale (anything malformed is ignored). */
export function isScale(v: unknown): v is GrindScale {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  if (s.kind === 'text') return true;
  return (
    s.kind === 'steps' &&
    typeof s.min === 'number' &&
    typeof s.max === 'number' &&
    Number.isInteger(s.min) &&
    Number.isInteger(s.max) &&
    s.max > s.min &&
    typeof s.between === 'number' &&
    Number.isInteger(s.between) &&
    s.between >= 0 &&
    s.between <= MAX_BETWEEN
  );
}

/** A grinder's scale: the owner's own setting, else its preset, else the default. */
export function scaleFor(
  grinder: string | null | undefined,
  custom: Record<string, GrindScale> = {},
): GrindScale {
  if (!grinder) return DEFAULT_SCALE;
  const own = custom[grinder];
  if (isScale(own)) return own;
  return presetFor(grinder)?.scale ?? DEFAULT_SCALE;
}

/** Digits after the point: none for whole numbers, one up to 9 steps between, then two. */
export const digitsOf = (s: StepScale) => (s.between === 0 ? 0 : s.between <= 9 ? 1 : 2);
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** A written setting split into its number and step (4.2 on the Ode → [4, 2]). */
function parts(v: number, s: StepScale): [number, number] {
  const d = digitsOf(s);
  const r = round(v, d);
  const whole = Math.floor(r + 1e-9);
  return [whole, Math.round((r - whole) * 10 ** d)];
}

const join = (whole: number, k: number, s: StepScale) =>
  round(whole + k / 10 ** digitsOf(s), digitsOf(s));

/** Every setting on the dial, in order. */
export function settingsOf(s: StepScale, cap = 5000): number[] {
  const out: number[] = [];
  for (let w = s.min; w <= s.max && out.length < cap; w++)
    for (let k = 0; k <= (w < s.max ? s.between : 0) && out.length < cap; k++)
      out.push(join(w, k, s));
  return out;
}

/** Where a setting sits along the dial, evenly spaced (Ode 4.2 → 4⅔), for charts and averages. */
export function positionOf(v: number, s: GrindScale): number {
  if (s.kind !== 'steps') return v;
  const [whole, k] = parts(v, s);
  return whole + Math.min(k, s.between) / (s.between + 1);
}

/** The nearest setting the dial has (clamped to its range). */
export function snapGrind(v: number, s: StepScale): number {
  const c = Math.min(s.max, Math.max(s.min, v));
  const [whole, k] = parts(c, s);
  if (k <= s.between) return join(whole, k, s);
  // Past the last step (4.7 on the Ode): the nearer of 4.2 and 5.
  const lo = join(whole, s.between, s);
  const hi = Math.min(whole + 1, s.max);
  return c - lo <= hi - c ? lo : hi;
}

/** One step finer (-1) or coarser (+1) from a setting, staying on the dial. */
export function stepGrind(v: number, dir: 1 | -1, s: StepScale): number {
  const [whole, k] = parts(snapGrind(v, s), s);
  const next =
    dir > 0
      ? k < s.between
        ? join(whole, k + 1, s)
        : whole + 1
      : k > 0
        ? join(whole, k - 1, s)
        : join(whole - 1, s.between, s);
  return Math.min(s.max, Math.max(s.min, next));
}

/** Where to start when nothing's set: the middle of the dial. */
export function middleOf(s: StepScale): number {
  return Math.floor((s.min + s.max) / 2);
}

/** A setting as it's written on this grinder: 4, 4.1, 4.2 on the Ode; 4.05, 4.10 with 10+ steps. */
export function formatGrind(v: number, s: GrindScale): string {
  if (s.kind !== 'steps' || !Number.isFinite(v)) return String(v);
  const [whole, k] = parts(v, s);
  return k === 0 ? String(whole) : `${whole}.${String(k).padStart(digitsOf(s), '0')}`;
}

/** A brew's grind as written: the write-in, or the number on its grinder's scale. */
export function grindLabel(
  b: { grinder: string | null; grind: number | null; grind_text?: string | null },
  custom: Record<string, GrindScale> = {},
): string | null {
  if (b.grind_text) return b.grind_text;
  return b.grind == null ? null : formatGrind(b.grind, scaleFor(b.grinder, custom));
}

/** The scale in a few words: "1 to 11, 2 steps between", "0 to 50, one decimal", "Write-in". */
export function describeScale(s: GrindScale): string {
  if (s.kind !== 'steps') return 'Write-in';
  const range = `${s.min} to ${s.max}`;
  if (s.between === 0) return `${range}, whole numbers`;
  if (s.between === STEPLESS_BETWEEN) return `${range}, one decimal`;
  return `${range}, ${s.between} ${s.between === 1 ? 'step' : 'steps'} between`;
}
