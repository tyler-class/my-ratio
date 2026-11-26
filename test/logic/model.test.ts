import { describe, expect, it } from 'vitest';
import {
  bestCombos,
  buildModel,
  grindTable,
  recentGrinds,
  streak,
} from '../../src/shared/logic/model';
import { dayIn, parseLocal } from '../../src/shared/logic/tz';
import { ratioOf, tempIn, tempOut } from '../../src/shared/logic/units';
import { mergeOptions } from '../../src/shared/lookups';
import type { AppState, Bean, Brew } from '../../src/shared/types';

const NOW = new Date(2026, 10, 4, 9, 0);
const ago = (d: number, h = 7) => new Date(2026, 10, 4 - d, h, 0).toISOString();

function bean(p: Partial<Bean>): Bean {
  return {
    id: 'b1',
    name: 'Kenya',
    roaster_id: 'r1',
    status: 'drinking',
    roasted_on: null,
    received_on: null,
    rest_until: null,
    thawed_on: null,
    finished_on: null,
    rest_days: null,
    events: [],
    tasting_notes: 'Cassis, lime',
    roaster_notes: null,
    origins: ['Kenya'],
    varieties: [],
    region: null,
    process: 'Washed',
    process_notes: null,
    altitude: null,
    bag_g: 250,
    cost: 25,
    notes: null,
    buy_again: null,
    images: [],
    created_at: ago(30),
    ...p,
  };
}
let n = 0;
function brew(p: Partial<Brew>): Brew {
  n++;
  return {
    rating_skipped: false,
    ratio_lock: true,
    id: `x${n}`,
    num: n,
    bean_id: 'b1',
    brewed_at: ago(0),
    method: 'V60',
    grinder: 'Ode',
    grind: 6,
    grind_text: null,
    dose_g: 20,
    water_ml: 320,
    water_temp_c: 94,
    recipe_notes: null,
    rating: null,
    extraction: null,
    strength: null,
    tasting_notes: null,
    next_time: null,
    ...p,
  };
}

const state = (beans: Bean[], brews: Brew[]): AppState => ({
  settings: {
    methods: [],
    grinders: [],
    temp_unit: 'F',
    currency: 'USD',
    currency_set: true,
    time_zone: 'UTC',
    insights_layout: [],
    telemetry: true,
    updates_set_up: false,
    origin_emojis: {},
    grind_scales: {},
  },
  roasters: [
    {
      id: 'r1',
      name: 'Sey',
      location: null,
      website: null,
      notes: null,
      images: [],
      created_at: ago(40),
    },
  ],
  beans,
  brews,
});

describe('buildModel', () => {
  const m = buildModel(
    state(
      [
        bean({}),
        bean({ id: 'b2', name: 'Frozen', status: 'freezing', bag_g: 300 }),
        bean({ id: 'b3', name: 'Done', status: 'finished' }),
      ],
      [
        brew({ brewed_at: ago(0), rating: 8, grind: 6 }),
        brew({ brewed_at: ago(1), rating: 6, grind: 6.4 }),
        brew({ brewed_at: ago(2), rating: 9, grind: 6 }),
        brew({ brewed_at: ago(40), bean_id: 'b3', rating: 5 }),
      ],
    ),
    NOW,
  );
  const k = m.beanMap.get('b1')!;

  it('totals usage, stock and cost per cup per bag', () => {
    expect(k.used).toBe(60);
    expect(k.remaining).toBe(190);
    expect(k.pct).toBeCloseTo(0.24);
    expect(k.avg).toBeCloseTo(23 / 3);
    expect(k.best!.rating).toBe(9);
    expect(k.last!.brewed_at).toBe(ago(0));
    expect(k.roasterName).toBe('Sey');
    expect(k.tags).toEqual(['Cassis', 'lime']);
    expect(m.brews[0]!.cup).toBeCloseTo(2);
  });

  it('estimates brews left from the last 7 days of doses', () => {
    const d = buildModel(
      state(
        [bean({})],
        [
          brew({ brewed_at: ago(0), dose_g: 18 }),
          brew({ brewed_at: ago(3), dose_g: 22 }),
          brew({ brewed_at: ago(10), dose_g: 40 }),
        ],
      ),
      NOW,
    );
    expect(d.dose7d).toBe(20);
    const none = buildModel(state([bean({})], [brew({ brewed_at: ago(10), dose_g: 15 })]), NOW);
    expect(none.dose7d).toBe(15);
  });

  it('works out burn rate and runway from live bags only', () => {
    // Live: Kenya 190 g left + Frozen 300 g. Finished bags don't count.
    expect(m.stock).toBe(490);
    expect(m.burn).toBeCloseTo(60 / 28);
    expect(m.runway).toBeCloseTo(490 / (60 / 28));
  });

  it('ranks grind settings and lists recent ones', () => {
    expect(grindTable(k)[0]).toMatchObject({ grind: '6', n: 2, avg: 8.5 });
    expect(recentGrinds(k)).toEqual([6, 6.4]);
  });

  it('counts the streak through today', () => {
    expect(streak(m.brews, NOW)).toBe(3);
  });
});

describe('units and time zones', () => {
  it('round-trips °F through stored °C', () => {
    for (const f of [195, 198, 201, 205, 208, 200.5]) expect(tempOut(tempIn(f, 'F'), 'F')).toBe(f);
    expect(tempOut(94, 'C')).toBe(94);
    expect(ratioOf(20, 333.4)).toBeCloseTo(16.67);
    expect(ratioOf(0, 300)).toBeNull();
  });

  it('reads wall times in the owner’s zone', () => {
    expect(parseLocal('2026-11-04 07:30', 'America/New_York')!.toISOString()).toBe(
      '2026-11-04T12:30:00.000Z',
    );
    expect(parseLocal('2026-07-04T07:30', 'America/New_York')!.toISOString()).toBe(
      '2026-07-04T11:30:00.000Z',
    );
    expect(parseLocal('2026-11-04T07:30:00Z', 'Asia/Tokyo')!.toISOString()).toBe(
      '2026-11-04T07:30:00.000Z',
    );
    expect(parseLocal('yesterday', 'UTC')).toBeNull();
    expect(dayIn(new Date('2026-11-05T02:00:00Z'), 'America/Los_Angeles')).toBe('2026-11-04');
  });

  it('merges options without case duplicates', () => {
    expect(mergeOptions(['kenya', 'Peru'], ['Kenya', 'Brazil'])).toEqual([
      'kenya',
      'Peru',
      'Brazil',
    ]);
  });
});

describe('bestCombos', () => {
  const at = (grind: number, water: number, rating: number, d: number) =>
    brew({ bean_id: 'c1', grind, water_ml: water, rating, brewed_at: ago(d) });
  it('takes the recipe of the single best-rated brew, even tried once', () => {
    const brews = [
      at(6, 320, 8, 1), // 6 · 1:16
      at(6, 320, 9, 2), // 6 · 1:16 → avg 8.5 over 2
      at(5, 340, 9, 3), // 5 · 1:17
      at(7, 300, 10, 5), // tried once, rated best: this one
      at(6, 340, 6, 6),
    ];
    const m = buildModel(state([bean({ id: 'c1' })], brews), NOW);
    const best = bestCombos(m.beanMap.get('c1')!);
    expect(best).toHaveLength(1);
    expect(best[0]).toMatchObject({ grind: '7', n: 1, bestId: brews[3]!.id });
    expect(best[0]!.ids).toEqual([brews[3]!.id]);
  });

  it('on a tie between recipes, takes the most recent', () => {
    const brews = [at(6, 320, 9, 4), at(5, 340, 9, 1), at(7, 300, 8, 2)];
    const m = buildModel(state([bean({ id: 'c1' })], brews), NOW);
    const best = bestCombos(m.beanMap.get('c1')!);
    expect(best).toHaveLength(1);
    expect(best[0]).toMatchObject({ grind: '5', bestId: brews[1]!.id });
  });
});

describe('bestCombos with temperature', () => {
  it('treats the same grind and ratio at another temperature as another recipe', () => {
    const at = (temp: number, rating: number, d: number) =>
      brew({
        bean_id: 't1',
        grind: 6,
        water_ml: 320,
        water_temp_c: temp,
        rating,
        brewed_at: ago(d),
      });
    const brews = [at(94, 9, 1), at(94, 8, 2), at(90, 6, 3), at(90, 6, 4)];
    const m = buildModel(state([bean({ id: 't1' })], brews), NOW);
    const best = bestCombos(m.beanMap.get('t1')!);
    expect(best).toHaveLength(1);
    expect(best[0]).toMatchObject({ grind: '6', ratio: 16, temp_c: 94, avg: 8.5, n: 2 });
  });
});

describe('bestCombos with method', () => {
  it('groups on the recipe, not the method, and reports the method mostly used', () => {
    const at = (method: string, rating: number, d: number) =>
      brew({ bean_id: 'm1', method, grind: 6, water_ml: 320, rating, brewed_at: ago(d) });
    const brews = [at('V60', 9, 1), at('V60', 8, 2), at('Kalita', 8, 3)];
    const m = buildModel(state([bean({ id: 'm1' })], brews), NOW);
    const best = bestCombos(m.beanMap.get('m1')!);
    expect(best).toHaveLength(1);
    expect(best[0]).toMatchObject({ method: 'V60', n: 3 });
  });
});

describe('bestCombos ratio', () => {
  it('shows the ratio actually used, not a rounded one', () => {
    const at = (water: number, rating: number, d: number) =>
      brew({ bean_id: 'q1', grind: 6, dose_g: 20, water_ml: water, rating, brewed_at: ago(d) });
    const brews = [at(333.4, 9, 1), at(333.4, 9, 2), at(334, 8, 3)];
    const m = buildModel(state([bean({ id: 'q1' })], brews), NOW);
    const best = bestCombos(m.beanMap.get('q1')!);
    expect(best[0]).toMatchObject({ ratio: 16.67, n: 3 });
  });
});
