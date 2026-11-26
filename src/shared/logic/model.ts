// Joins the raw rows into the view model the app renders: per-bag usage, ratings and
// stock, plus overall burn rate and runway. Pure, so it's unit-tested.
import { grindLabel, type GrindScale } from '../grind';
import { LIVE_STATUSES, flagFor } from '../lookups';
import type { AppState, Bean, Brew, Roaster } from '../types';
import { dayKey, daysBetween } from './dates';
import { ratioOf } from './units';

export interface BrewView extends Brew {
  date: Date;
  key: string;
  ratio: number | null;
  bean: BeanView | null;
  beanName: string;
  roasterName: string;
  /** What the coffee in this cup cost. */
  cup: number | null;
}

export interface BeanView extends Bean {
  roaster: Roaster | null;
  roasterName: string;
  created: Date;
  tags: string[];
  brews: BrewView[];
  rated: BrewView[];
  used: number;
  avg: number | null;
  best: BrewView | null;
  last: BrewView | null;
  remaining: number | null;
  /** Share of the bag used, 0–1. */
  pct: number | null;
  perG: number | null;
}

export interface Model {
  roasters: Roaster[];
  beans: BeanView[];
  brews: BrewView[];
  beanMap: Map<string, BeanView>;
  brewMap: Map<string, BrewView>;
  roasterMap: Map<string, Roaster>;
  /** Grams on hand across bags that aren't finished or still on order. */
  stock: number;
  /** Average grams brewed per day over the last 28 days. */
  burn: number;
  runway: number | null;
  /** Typical dose lately, for "cups left" estimates. */
  avgDose: number;
  /** Average dose over the last 7 days (falls back to avgDose), for "brews left" estimates. */
  dose7d: number;
  /** An origin's mark: its chosen emoji, else its country flag, else nothing. */
  mark: (origin: string) => string;
}

export const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export function splitTags(s: string | null): string[] {
  return (s ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function buildModel(state: AppState, now = new Date()): Model {
  const roasterMap = new Map(state.roasters.map((r) => [r.id, r]));
  const beans: BeanView[] = state.beans.map((b) => {
    const roaster = b.roaster_id ? (roasterMap.get(b.roaster_id) ?? null) : null;
    return {
      ...b,
      roaster,
      roasterName: roaster?.name ?? '',
      created: new Date(b.created_at),
      tags: splitTags(b.tasting_notes),
      brews: [],
      rated: [],
      used: 0,
      avg: null,
      best: null,
      last: null,
      remaining: null,
      pct: null,
      perG: null,
    };
  });
  const beanMap = new Map(beans.map((b) => [b.id, b]));

  const brews: BrewView[] = state.brews
    .map((br) => {
      const date = new Date(br.brewed_at);
      const bean = br.bean_id ? (beanMap.get(br.bean_id) ?? null) : null;
      return {
        ...br,
        date,
        key: dayKey(date),
        ratio: ratioOf(br.dose_g, br.water_ml),
        bean,
        beanName: bean?.name ?? 'Unknown bean',
        roasterName: bean?.roasterName ?? '',
        cup: bean?.bag_g && bean.cost && br.dose_g ? (br.dose_g * bean.cost) / bean.bag_g : null,
      };
    })
    .filter((b) => !Number.isNaN(b.date.getTime()))
    .sort((a, b) => b.date.getTime() - a.date.getTime() || b.num - a.num);
  const brewMap = new Map(brews.map((b) => [b.id, b]));

  for (const br of brews) {
    if (!br.bean) continue;
    br.bean.brews.push(br);
    if (br.dose_g) br.bean.used += br.dose_g;
  }
  for (const b of beans) {
    b.rated = b.brews.filter((x) => x.rating != null);
    b.avg = mean(b.rated.map((x) => x.rating!));
    for (const x of b.rated) if (!b.best || x.rating! > b.best.rating!) b.best = x;
    b.last = b.brews[0] ?? null;
    b.remaining = b.bag_g ? Math.max(0, b.bag_g - b.used) : null;
    b.pct = b.bag_g ? Math.min(1, b.used / b.bag_g) : null;
    b.perG = b.bag_g && b.cost ? b.cost / b.bag_g : null;
  }

  const burn =
    brews
      .filter((b) => b.dose_g && daysBetween(b.date, now) <= 27)
      .reduce((s, b) => s + b.dose_g!, 0) / 28;
  const stock = beans
    .filter((b) => LIVE_STATUSES.includes(b.status))
    .reduce((s, b) => s + (b.remaining ?? 0), 0);
  const recentDoses = brews
    .slice(0, 14)
    .filter((b) => b.dose_g)
    .map((b) => b.dose_g!);

  return {
    roasters: [...state.roasters].sort((a, b) => a.name.localeCompare(b.name)),
    beans,
    brews,
    beanMap,
    brewMap,
    roasterMap,
    stock,
    burn,
    runway: burn > 0 ? stock / burn : null,
    avgDose: mean(recentDoses) ?? 20,
    dose7d:
      mean(brews.filter((b) => b.dose_g && daysBetween(b.date, now) <= 6).map((b) => b.dose_g!)) ??
      mean(recentDoses) ??
      20,
    mark: (o) => state.settings.origin_emojis?.[o] ?? flagFor(o),
  };
}

/** Grind settings this bag was brewed at recently, newest first. */
export function recentGrinds(bean: BeanView | null, limit = 5): number[] {
  const out: number[] = [];
  for (const b of bean?.brews.slice(0, 8) ?? []) {
    if (b.grind != null && !out.includes(b.grind)) out.push(b.grind);
  }
  return out.slice(0, limit);
}

/** Average rating per grind setting (as written on its grinder), best first. */
export function grindTable(
  bean: BeanView,
  scales: Record<string, GrindScale> = {},
): { grind: string; n: number; avg: number }[] {
  const by = new Map<string, number[]>();
  for (const x of bean.rated) {
    const g = grindLabel(x, scales);
    if (g == null) continue;
    by.set(g, [...(by.get(g) ?? []), x.rating!]);
  }
  return [...by]
    .map(([grind, r]) => ({ grind, n: r.length, avg: mean(r)! }))
    .sort((a, b) => b.avg - a.avg || b.n - a.n);
}

export interface Combo {
  /** The method these brews used most: not part of the recipe, just how it was brewed. */
  method: string | null;
  grinder: string | null;
  /** The grind as written ("4.2"). */
  grind: string;
  /** The ratio these brews used, exactly (to two decimals: 16.67 for 1:16.67). */
  ratio: number;
  n: number;
  avg: number;
  /** The brews at this grind and ratio, newest first. */
  ids: string[];
  /** The best-rated of them (newest on a tie): the recipe to brew again. */
  bestId: string;
  /** The water temperature (°C) used most often across them, or null if none was logged. */
  temp_c: number | null;
}

/**
 * The recipe of the best-rated brew: its grinder, grind, ratio and water temperature together
 * (with the method it was mostly brewed by). One brew is enough: no need to have tried it twice.
 * When brews with different recipes share the top rating, the most recent one's recipe wins.
 * `ids` are that recipe's brews at that top rating (the ones starred); `n` and `avg` are over all
 * of the recipe's brews.
 */
export function bestCombos(
  bean: BeanView,
  scales: Record<string, GrindScale> = {},
  /** Only brews on this grinder (grind settings don't compare across grinders). */
  onGrinder?: string | null,
): Combo[] {
  const by = new Map<
    string,
    { c: Omit<Combo, 'n' | 'avg' | 'bestId' | 'temp_c' | 'method' | 'ratio'>; brews: BrewView[] }
  >();
  for (const x of bean.rated) {
    const grind = grindLabel(x, scales);
    if (grind == null || !x.ratio) continue;
    if (onGrinder !== undefined && x.grinder !== onGrinder) continue;
    // Ratios a gram of water apart (20 g to 333 or 334 g) are the same recipe: grouped to the
    // nearest 0.1, and shown as the ratio actually used most.
    const bucket = Math.round(x.ratio * 10) / 10;
    // Temperatures within half a degree (C) count as the same: 201°F and 94°C both land on 94.
    const temp = x.water_temp_c == null ? 'none' : Math.round(x.water_temp_c * 2) / 2;
    const k = `${x.grinder ?? ''}|${grind}|${bucket}|${temp}`;
    const e = by.get(k) ?? { c: { grinder: x.grinder, grind, ids: [] }, brews: [] };
    e.c.ids.push(x.id);
    e.brews.push(x);
    by.set(k, e);
  }
  const all = [...by.values()].map(({ c, brews }) => ({
    ...c,
    n: brews.length,
    avg: mean(brews.map((x) => x.rating!))!,
    bestId: brews.reduce((a, x) => (x.rating! > a.rating! ? x : a)).id,
    temp_c: mostCommon(brews.map((x) => x.water_temp_c)),
    method: mostCommon(brews.map((x) => x.method)),
    ratio: mostCommon(brews.map((x) => Math.round(x.ratio! * 100) / 100))!,
  }));
  // The best-rated brew among them (the most recent on a tie).
  let best: BrewView | null = null;
  for (const { brews } of by.values())
    for (const x of brews)
      if (
        !best ||
        x.rating! > best.rating! ||
        (x.rating === best.rating && x.date.getTime() > best.date.getTime())
      )
        best = x;
  if (!best) return [];
  const combo = all.find((c) => c.ids.includes(best.id))!;
  const group = [...by.values()].find((g) => g.c.ids === combo.ids)!;
  return [
    {
      ...combo,
      ids: group.brews.filter((x) => x.rating === best.rating).map((x) => x.id),
      bestId: best.id,
    },
  ];
}

/** The value seen most often (the first seen on a tie), ignoring blanks. */
function mostCommon<T extends string | number>(vs: (T | null)[]): T | null {
  const n = new Map<T, number>();
  for (const v of vs) if (v != null) n.set(v, (n.get(v) ?? 0) + 1);
  let best: T | null = null;
  for (const [v, c] of n) if (best == null || c > n.get(best)!) best = v;
  return best;
}

/** Consecutive days with a brew, ending today (or yesterday if nothing yet today). */
export function streak(brews: { key: string }[], now = new Date()): number {
  const keys = new Set(brews.map((b) => b.key));
  const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!keys.has(dayKey(cur))) cur.setDate(cur.getDate() - 1);
  let n = 0;
  while (keys.has(dayKey(cur))) {
    n++;
    cur.setDate(cur.getDate() - 1);
  }
  return n;
}
