import { describe, expect, it } from 'vitest';
import { buildModel } from '../../src/shared/logic/model';
import {
  arrivedBody,
  arrivedNotices,
  bagDose,
  beansLow,
  beansLowNotice,
  brewsLeft,
  dueNotices,
  emptyBody,
  emptyDay,
  emptyNotices,
  FREEZER_DAYS,
  freezerBody,
  freezerNotices,
  LATE_DAYS,
  LOW_DAYS,
  lowBody,
  lowSince,
  NOTIFY_KINDS,
  ORDER_DAYS,
  rateBody,
  rateNotice,
  RATE_HOUR,
  readyBody,
  readyNotices,
  type Notice,
} from '../../src/shared/logic/notify';
import type { AppState, Bean, Brew } from '../../src/shared/types';

const NOW = new Date(2026, 10, 9, 9, 0);
const ago = (d: number) => new Date(2026, 10, 9 - d, 7, 0).toISOString();

function bean(p: Partial<Bean>): Bean {
  return {
    id: 'b1',
    name: 'Kenya',
    roaster_id: null,
    status: 'drinking',
    roasted_on: null,
    received_on: null,
    rest_until: null,
    thawed_on: null,
    finished_on: null,
    tasting_notes: null,
    roaster_notes: null,
    origins: [],
    varieties: [],
    region: null,
    process: null,
    process_notes: null,
    altitude: null,
    bag_g: 250,
    cost: null,
    notes: null,
    buy_again: null,
    images: [],
    created_at: ago(40),
    ...p,
  };
}

let n = 0;
function brew(p: Partial<Brew>): Brew {
  n++;
  return {
    rating_skipped: false,
    id: `x${n}`,
    num: n,
    bean_id: 'old',
    brewed_at: ago(0),
    method: 'V60',
    grinder: null,
    grind: null,
    dose_g: 20,
    water_ml: 320,
    water_temp_c: null,
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
  },
  roasters: [],
  beans,
  brews,
});

// One 20 g brew a day for the last 28 days, all from a finished bag: 20 g a day.
const daily = Array.from({ length: 28 }, (_, d) => brew({ brewed_at: ago(d) }));
const done = bean({ id: 'old', status: 'finished', bag_g: 560 });
/** The model with `grams` left in an open bag (plus any other bags). */
const withStock = (grams: number, more: Bean[] = []) =>
  buildModel(state([done, bean({ bag_g: grams }), ...more], daily), NOW);

describe('beans running low', () => {
  it('has six kinds, each with a short one-line description', () => {
    expect(NOTIFY_KINDS.map((k) => k.id)).toEqual([
      'beans',
      'ready',
      'rate',
      'empty',
      'arrived',
      'freezer',
    ]);
    expect(NOTIFY_KINDS.map((k) => k.label)).toEqual([
      'Beans running low',
      'Bag ready to drink',
      'Rate your brew',
      'Bag almost empty',
      'Order arrived?',
      'Freezer reminder',
    ]);
    for (const k of NOTIFY_KINDS) {
      expect(k.description).toMatch(/^[^.]+\.$/);
      expect(k.description.length).toBeLessThanOrEqual(40);
    }
  });

  it('uses the model’s runway: live grams ÷ grams a day over 28 days', () => {
    const m = withStock(180, [bean({ id: 'f', status: 'freezing', bag_g: 100 })]);
    expect(m.burn).toBe(20);
    expect(m.runway).toBe(14);
    expect(beansLow(m)).toBe(false); // exactly 14 days isn't low
    expect(beansLow(withStock(279))).toBe(true); // 13.95 days
    expect(beansLow(withStock(400))).toBe(false);
  });

  it('counts resting, frozen and open bags, but not finished ones', () => {
    expect(withStock(100, [bean({ id: 'r', status: 'resting', bag_g: 200 })]).runway).toBe(15);
    expect(withStock(100, [bean({ id: 'x', status: 'finished', bag_g: 200 })]).runway).toBe(5);
  });

  it('is still low with a bag on order (not in hand yet), but not with no recent brews', () => {
    expect(beansLow(withStock(100))).toBe(true);
    const ordered = withStock(100, [bean({ id: 'o', status: 'ordered', bag_g: 340 })]);
    expect(ordered.runway).toBe(5);
    expect(beansLow(ordered)).toBe(true);
    const idle = buildModel(state([bean({ bag_g: 50 })], []), NOW);
    expect(idle.runway).toBeNull();
    expect(beansLow(idle)).toBe(false);
  });

  it('words the days left', () => {
    expect(lowBody(9.4)).toBe('About 9 days of coffee left. Time to order more.');
    expect(lowBody(1.2)).toBe('About 1 day of coffee left. Time to order more.');
    expect(lowBody(0)).toBe('You’re about out of coffee. Time to order more.');
    expect(beansLowNotice(9, '2026-11-09')).toEqual({
      kind: 'beans',
      key: 'low-2026-11-09',
      title: 'Beans running low',
      body: 'About 9 days of coffee left. Time to order more.',
      url: '/beans',
      tag: 'beans-low',
    });
  });

  it('sends once per drop: crossing, staying low, recovering, dropping again', () => {
    // Each day's runway, and what a device gets that day (the worker skips a spell it's sent).
    const days: [string, number][] = [
      ['2026-11-01', 20],
      ['2026-11-02', 13], // crosses under 14: sent
      ['2026-11-03', 12], // still low: not again
      ['2026-11-04', 10], // still low: not again
      ['2026-11-05', 15], // a new bag: recovered
      ['2026-11-06', 14], // at 14 counts as recovered too
      ['2026-11-07', 9], // drops again: sent again
      ['2026-11-08', 8],
    ];
    let since: string | null = null;
    const sent = new Set<string>();
    const got: string[] = [];
    for (const [today, runway] of days) {
      since = lowSince(since, runway < LOW_DAYS, today);
      if (!since) continue;
      const notice = beansLowNotice(runway, since);
      if (sent.has(notice.key)) continue;
      sent.add(notice.key);
      got.push(`${today}: ${notice.body}`);
    }
    expect(got).toEqual([
      '2026-11-02: About 13 days of coffee left. Time to order more.',
      '2026-11-07: About 9 days of coffee left. Time to order more.',
    ]);
    expect(since).toBe('2026-11-07');
  });
});

// ---- The once-per-bag and once-a-day kinds ----

const TZ = 'America/Los_Angeles';
/** A local instant in TZ (November 2026 is PST, UTC−8). */
const la = (day: string, hour = 9) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + (hour + 8) * 3_600_000);

/**
 * What a device gets on each day of `days` at `hour` local, with the worker's rule: skip any key
 * it already got. `model(day)` is the coffee log that day.
 */
function simulate(days: string[], model: (day: string) => ReturnType<typeof buildModel>, hour = 9) {
  const sent = new Set<string>();
  const got: string[] = [];
  for (const day of days) {
    for (const n of dueNotices(model(day), la(day, hour), TZ)) {
      if (sent.has(`${n.kind}/${n.key}`)) continue;
      sent.add(`${n.kind}/${n.key}`);
      got.push(`${day} ${n.kind}: ${n.body}`);
    }
  }
  return got;
}

const range = (from: string, n: number) =>
  Array.from({ length: n }, (_, i) =>
    new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10),
  );

describe('bag ready to drink', () => {
  const kenya = bean({
    id: 'k',
    name: 'Kenya Gichathaini',
    status: 'resting',
    rest_until: '2026-11-12',
  });

  it('picks resting bags whose rest ends today (or up to LATE_DAYS ago)', () => {
    const m = buildModel(state([kenya], []), NOW);
    expect(readyNotices(m, '2026-11-11')).toEqual([]);
    expect(readyNotices(m, '2026-11-12')).toEqual([
      {
        kind: 'ready',
        key: 'k',
        title: 'Bag ready to drink',
        body: 'Kenya Gichathaini is ready to drink.',
        url: '/beans?bean=k',
        tag: 'ready-k',
      },
    ]);
    expect(readyNotices(m, '2026-11-15')).toHaveLength(1); // 3 days late
    expect(readyNotices(m, '2026-11-16')).toEqual([]); // too late
    // Not resting (opened, frozen) or no rest date: nothing.
    for (const p of [{ status: 'drinking' as const }, { rest_until: null }])
      expect(readyNotices(buildModel(state([{ ...kenya, ...p }], []), NOW), '2026-11-12')).toEqual(
        [],
      );
    expect(readyBody('Ethiopia Guji')).toBe('Ethiopia Guji is ready to drink.');
  });

  it('sends once per bag, on the morning it’s ready', () => {
    const m = buildModel(state([kenya], []), NOW);
    expect(simulate(range('2026-11-09', 10), () => m)).toEqual([
      '2026-11-12 ready: Kenya Gichathaini is ready to drink.',
    ]);
  });
});

describe('rate your brew', () => {
  const at = (day: string, hour: number, p: Partial<Brew> = {}) =>
    brew({ bean_id: null, brewed_at: la(day, hour).toISOString(), ...p });

  it('counts today’s brews with no rating (not skipped), in the device’s zone', () => {
    const brews = [
      at('2026-11-09', 7),
      at('2026-11-09', 13),
      at('2026-11-09', 9, { rating: 4 }),
      at('2026-11-09', 10, { rating_skipped: true }),
      at('2026-11-08', 7), // yesterday
      at('2026-11-09', 23), // 07:00 UTC on the 10th: still today in LA
    ];
    const m = buildModel(state([], brews), NOW);
    expect(rateNotice(m, '2026-11-09', RATE_HOUR, TZ)).toEqual({
      kind: 'rate',
      key: 'rate-2026-11-09',
      title: 'Rate your brew',
      body: '3 brews today aren’t rated yet.',
      url: '/journal?rated=unrated',
      tag: 'rate',
    });
    expect(rateNotice(m, '2026-11-09', RATE_HOUR - 1, TZ)).toBeNull(); // before 8 p.m.
    expect(rateNotice(m, '2026-11-10', 21, TZ)).toBeNull(); // nothing logged yet
    expect(rateBody(1)).toBe('1 brew today isn’t rated yet.');
    expect(rateBody(2)).toBe('2 brews today aren’t rated yet.');
  });

  it('sends once a day, at 8 p.m., only on days with unrated brews', () => {
    let brews = [at('2026-11-09', 7), at('2026-11-09', 8)];
    const sent = new Set<string>();
    const got: string[] = [];
    const run = (day: string, hour: number) => {
      for (const n of dueNotices(buildModel(state([], brews), la(day, hour)), la(day, hour), TZ))
        if (!sent.has(n.key)) {
          sent.add(n.key);
          got.push(`${day} ${hour}:00 ${n.body}`);
        }
    };
    for (const h of [9, 19, 20, 21, 23]) run('2026-11-09', h);
    // The 10th: one brew, rated before 8 p.m. Nothing.
    brews = [...brews, at('2026-11-10', 7, { rating: 5 })];
    run('2026-11-10', 20);
    // The 11th: one unrated.
    brews = [...brews, at('2026-11-11', 7)];
    run('2026-11-11', 20);
    run('2026-11-11', 22);
    expect(got).toEqual([
      '2026-11-09 20:00 2 brews today aren’t rated yet.',
      '2026-11-11 20:00 1 brew today isn’t rated yet.',
    ]);
  });
});

describe('bag almost empty', () => {
  /** A 250 g open bag and `n` 20 g brews from it, one a day ending on `last`. */
  function drinking(n: number, last = '2026-11-09', p: Partial<Bean> = {}) {
    const b = bean({ id: 'k', name: 'Kenya Gichathaini', bag_g: 250, ...p });
    const end = Date.parse(`${last}T00:00:00Z`);
    const day = (i: number) => new Date(end - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const brews = Array.from({ length: n }, (_, i) =>
      brew({ bean_id: 'k', brewed_at: la(day(i), 7).toISOString() }),
    );
    return buildModel(state([b], brews), NOW);
  }

  it('uses grams left ÷ the bag’s recent dose (else the usual dose)', () => {
    const m = drinking(10); // 50 g left at 20 g a brew
    const b = m.beanMap.get('k')!;
    expect(bagDose(m, b)).toBe(20);
    expect(brewsLeft(m, b)).toBe(2.5);
    expect(emptyDay(m, b, TZ)).toBeNull(); // 2.5 is more than about 2
    // A bag with no brews of its own falls back to the household's usual dose.
    const fresh = buildModel(state([done, bean({ id: 'n', bag_g: 30 })], daily.slice(0, 5)), NOW);
    expect(bagDose(fresh, fresh.beanMap.get('n')!)).toBe(fresh.avgDose);
  });

  it('picks the open bag the day a brew takes it to about 2 brews', () => {
    const m = drinking(11); // 30 g left: 1.5 brews, since the 11th brew (today)
    expect(emptyNotices(m, '2026-11-09', TZ)).toEqual([
      {
        kind: 'empty',
        key: 'k',
        title: 'Bag almost empty',
        body: 'Kenya Gichathaini has about 2 brews left.',
        url: '/beans?bean=k',
        tag: 'empty-k',
      },
    ]);
    // Still due a few days later if missed, but not after.
    expect(emptyNotices(m, addDay('2026-11-09', LATE_DAYS), TZ)).toHaveLength(1);
    expect(emptyNotices(m, addDay('2026-11-09', LATE_DAYS + 1), TZ)).toEqual([]);
    // Not the open bag, an empty bag, or no bag size: nothing.
    for (const p of [{ status: 'resting' as const }, { bag_g: 220 }, { bag_g: null }])
      expect(emptyNotices(drinking(11, '2026-11-09', p), '2026-11-09', TZ)).toEqual([]);
    expect(emptyBody('Kenya', 2.4)).toBe('Kenya has about 2 brews left.');
    expect(emptyBody('Kenya', 0.3)).toBe('Kenya has about 1 brew left.');
  });

  it('sends once per bag as the bag runs down', () => {
    // One brew a day from Nov 1 (bag of 250 g, 20 g each): 2 brews left after the 11th brew.
    const got = simulate(range('2026-11-01', 13), (day) => {
      const n = 1 + Math.round((Date.parse(day) - Date.parse('2026-11-01')) / 86_400_000);
      return drinking(n, day);
    });
    expect(got).toEqual(['2026-11-11 empty: Kenya Gichathaini has about 2 brews left.']);
  });
});

describe('order arrived?', () => {
  const ordered = bean({
    id: 'k',
    name: 'Kenya Gichathaini',
    status: 'ordered',
    created_at: la('2026-11-01', 18).toISOString(),
  });

  it('picks bags still on order more than a week after they were added', () => {
    const m = buildModel(state([ordered], []), NOW);
    expect(arrivedNotices(m, addDay('2026-11-01', ORDER_DAYS), TZ)).toEqual([]);
    expect(arrivedNotices(m, addDay('2026-11-01', ORDER_DAYS + 1), TZ)).toEqual([
      {
        kind: 'arrived',
        key: 'k',
        title: 'Order arrived?',
        body: 'Did Kenya Gichathaini arrive? Mark it as received.',
        url: '/beans?bean=k',
        tag: 'arrived-k',
      },
    ]);
    // Arrived (resting now): nothing.
    const arrived = buildModel(state([{ ...ordered, status: 'resting' }], []), NOW);
    expect(arrivedNotices(arrived, '2026-11-09', TZ)).toEqual([]);
    expect(arrivedBody('Ethiopia Guji')).toBe('Did Ethiopia Guji arrive? Mark it as received.');
  });

  it('sends once per bag', () => {
    const m = buildModel(state([ordered], []), NOW);
    expect(simulate(range('2026-11-01', 40), () => m)).toEqual([
      '2026-11-09 arrived: Did Kenya Gichathaini arrive? Mark it as received.',
    ]);
  });
});

describe('freezer reminder', () => {
  const guji = bean({
    id: 'g',
    name: 'Ethiopia Guji',
    status: 'freezing',
    received_on: '2026-08-01',
  });

  it('picks bags frozen more than 90 days (since they arrived)', () => {
    expect(FREEZER_DAYS).toBe(90);
    const m = buildModel(state([guji], []), NOW);
    expect(freezerNotices(m, addDay('2026-08-01', FREEZER_DAYS), TZ)).toEqual([]);
    expect(freezerNotices(m, addDay('2026-08-01', FREEZER_DAYS + 1), TZ)).toEqual([
      {
        kind: 'freezer',
        key: 'g',
        title: 'Freezer reminder',
        body: 'Ethiopia Guji has been frozen for 3 months.',
        url: '/beans?bean=g',
        tag: 'freezer-g',
      },
    ]);
    // Out of the freezer: nothing.
    const thawed = buildModel(state([{ ...guji, status: 'resting' }], []), NOW);
    expect(freezerNotices(thawed, addDay('2026-08-01', 91), TZ)).toEqual([]);
    expect(freezerBody('Ethiopia Guji', 91)).toBe('Ethiopia Guji has been frozen for 3 months.');
    expect(freezerBody('Ethiopia Guji', 200)).toBe('Ethiopia Guji has been frozen for 6 months.');
  });

  it('falls back to the day it was added, and sends once per bag', () => {
    const m = buildModel(
      state([{ ...guji, received_on: null, created_at: la('2026-08-01', 12).toISOString() }], []),
      NOW,
    );
    expect(simulate(range('2026-08-01', 200), () => m)).toEqual([
      '2026-10-31 freezer: Ethiopia Guji has been frozen for 3 months.',
    ]);
  });
});

describe('all of them together', () => {
  it('each kind once, beans running low aside (the worker tracks its spell)', () => {
    const m = buildModel(
      state(
        [
          bean({ id: 'r', name: 'Resting', status: 'resting', rest_until: '2026-11-09' }),
          bean({
            id: 'o',
            name: 'Ordered',
            status: 'ordered',
            created_at: la('2026-11-01').toISOString(),
          }),
          bean({ id: 'f', name: 'Frozen', status: 'freezing', received_on: '2026-08-10' }),
        ],
        [brew({ bean_id: null, brewed_at: la('2026-11-09', 7).toISOString() })],
      ),
      NOW,
    );
    const kinds = (n: Notice[]) => n.map((x) => `${x.kind}:${x.key}`);
    expect(kinds(dueNotices(m, la('2026-11-09', 9), TZ))).toEqual([
      'ready:r',
      'arrived:o',
      'freezer:f',
    ]);
    expect(kinds(dueNotices(m, la('2026-11-09', 20), TZ))).toEqual([
      'ready:r',
      'rate:rate-2026-11-09',
      'arrived:o',
      'freezer:f',
    ]);
  });
});

function addDay(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
