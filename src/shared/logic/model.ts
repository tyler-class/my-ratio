// Joins the raw rows into the view model the app renders: per-bag usage, ratings and
// stock, plus household-wide burn rate and runway. Pure, so it's unit-tested.
import { LIVE_STATUSES } from '../lookups';
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

/** Average rating per grind setting, best first. */
export function grindTable(bean: BeanView): { grind: number; n: number; avg: number }[] {
  const by = new Map<number, number[]>();
  for (const x of bean.rated) {
    if (x.grind == null) continue;
    by.set(x.grind, [...(by.get(x.grind) ?? []), x.rating!]);
  }
  return [...by]
    .map(([grind, r]) => ({ grind, n: r.length, avg: mean(r)! }))
    .sort((a, b) => b.avg - a.avg || b.n - a.n);
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
