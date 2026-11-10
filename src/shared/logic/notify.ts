// What Ratio's notifications say and when. Pure, so each rule is unit-tested; the worker
// (src/worker/notifications.ts) feeds it the model and skips any key a device already got.
// Sending, the 8 a.m. timing and the sent log are the Selfhost Kit's (src/worker/kit/push.ts).
//
// - Beans running low: once each time the coffee on hand drops under two weeks.
// - Bag ready to drink, Bag almost empty, Order arrived?, Freezer reminder: once per bag, on the
//   day it happens (or up to LATE_DAYS later if that day was missed, never after).
// - Rate your brew: once a day, from RATE_HOUR, when some of today's brews aren't rated.
import type { BeanView, Model } from './model';
import { dayDiff, dayIn, hourIn } from './tz';

/** The kinds of notification, each with its own switch in Settings. */
export const NOTIFY_KINDS = [
  {
    id: 'beans',
    label: 'Beans running low',
    description: 'Under two weeks of coffee left.',
  },
  {
    id: 'ready',
    label: 'Bag ready to drink',
    description: 'A resting bag is done resting.',
  },
  {
    id: 'rate',
    label: 'Rate your brew',
    description: 'Evening nudge for unrated brews.',
  },
  {
    id: 'empty',
    label: 'Bag almost empty',
    description: 'About two brews left in the open bag.',
  },
  {
    id: 'arrived',
    label: 'Order arrived?',
    description: 'A bag still on order after a week.',
  },
  {
    id: 'freezer',
    label: 'Freezer reminder',
    description: 'A bag frozen for three months.',
  },
] as const;

export type NotifyKind = (typeof NOTIFY_KINDS)[number]['id'];

/** Ratio has no app-icon count. */
export const BADGE_MEANS = undefined;

/** Under this many days of runway counts as low. */
export const LOW_DAYS = 14;

export interface Notice {
  kind: NotifyKind;
  /**
   * What it's about, sent once ever per device: the low spell ("low-2026-11-09"), the bag's id,
   * or the day ("rate-2026-11-09").
   */
  key: string;
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * Beans are low when the runway is under LOW_DAYS days. The runway counts only bags in hand, so
 * a bag on order doesn't count until it arrives. No recent brews means no runway, so not low.
 */
export function beansLow(m: Pick<Model, 'runway'>): boolean {
  return m.runway != null && m.runway < LOW_DAYS;
}

/**
 * The current low spell after this run: the date it started (kept while it stays low), or null
 * once the runway is back at or above LOW_DAYS. A new drop starts a new spell, so it's sent again.
 */
export function lowSince(prev: string | null, low: boolean, today: string): string | null {
  return low ? (prev ?? today) : null;
}

/** "About 9 days of coffee left. Time to order more." */
export function lowBody(runway: number): string {
  const days = Math.round(runway);
  if (runway < 0.5) return 'You’re about out of coffee. Time to order more.';
  return `About ${days} ${days === 1 ? 'day' : 'days'} of coffee left. Time to order more.`;
}

/** The notification for a low spell that started on `since`. */
export function beansLowNotice(runway: number, since: string): Notice {
  return {
    kind: 'beans',
    key: `low-${since}`,
    title: 'Beans running low',
    body: lowBody(runway),
    url: '/beans',
    tag: 'beans-low',
  };
}

// ---------------------------------------------------------------------------------------------
// Once per bag, and once a day

/**
 * A bag's day that was missed (the cron was down, the phone was off) still goes out up to this
 * many days late, never after. Well inside the kit's 60-day sent log, so it can't come back.
 */
export const LATE_DAYS = 3;
/** "Order arrived?" once a bag has been on order more than this many days. */
export const ORDER_DAYS = 7;
/** "Freezer reminder" once a bag has been frozen more than this many days (about 3 months). */
export const FREEZER_DAYS = 90;
/** "Bag almost empty" at about this many brews left. */
export const EMPTY_BREWS = 2;
/** "Rate your brew" goes out from this hour, local time (8 p.m.). */
export const RATE_HOUR = 20;

/** Whether something that happened on `day` is due today: that day, or up to LATE_DAYS later. */
export function dueOn(day: string | null, today: string): boolean {
  if (!day) return false;
  const late = dayDiff(day, today);
  return late >= 0 && late <= LATE_DAYS;
}

/** The day `n` days after `day` (both YYYY-MM-DD). */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(day + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
}

/** Opens the bag's sheet (Layout reads ?bean=). */
export const bagUrl = (id: string) => `/beans?bean=${encodeURIComponent(id)}`;

function bagNotice(kind: NotifyKind, b: BeanView, body: string): Notice {
  const title = NOTIFY_KINDS.find((k) => k.id === kind)!.label;
  return { kind, key: b.id, title, body, url: bagUrl(b.id), tag: `${kind}-${b.id}` };
}

// Bag ready to drink ----------------------------------------------------------------------------

/** The day a resting bag is ready (its rest_until), or null. */
export const readyDay = (b: BeanView) => (b.status === 'resting' ? b.rest_until : null);

/** "Kenya Gichathaini is ready to drink." */
export const readyBody = (name: string) => `${name} is ready to drink.`;

export function readyNotices(m: Pick<Model, 'beans'>, today: string): Notice[] {
  return m.beans
    .filter((b) => dueOn(readyDay(b), today))
    .map((b) => bagNotice('ready', b, readyBody(b.name)));
}

// Rate your brew --------------------------------------------------------------------------------

/** Brews logged today (in tz) still waiting for a rating (not rated, not dismissed). */
export function unratedToday(m: Pick<Model, 'brews'>, today: string, tz: string): number {
  return m.brews.filter((b) => b.rating == null && !b.rating_skipped && dayIn(b.date, tz) === today)
    .length;
}

/** "2 brews today aren't rated yet." */
export const rateBody = (n: number) =>
  n === 1 ? '1 brew today isn’t rated yet.' : `${n} brews today aren’t rated yet.`;

/** From RATE_HOUR local, once a day, when some of today's brews aren't rated. */
export function rateNotice(
  m: Pick<Model, 'brews'>,
  today: string,
  hour: number,
  tz: string,
): Notice | null {
  if (hour < RATE_HOUR) return null;
  const n = unratedToday(m, today, tz);
  if (!n) return null;
  return {
    kind: 'rate',
    key: `rate-${today}`,
    title: 'Rate your brew',
    body: rateBody(n),
    url: '/journal?rated=unrated',
    tag: 'rate',
  };
}

// Bag almost empty ------------------------------------------------------------------------------

/** A bag's usual dose: its last 5 brews with a dose, else the household's recent average. */
export function bagDose(m: Pick<Model, 'avgDose'>, b: BeanView): number {
  const doses = b.brews
    .filter((x) => x.dose_g)
    .slice(0, 5)
    .map((x) => x.dose_g!);
  return doses.length ? doses.reduce((s, x) => s + x, 0) / doses.length : m.avgDose;
}

/** Brews left in a bag (grams remaining ÷ its usual dose), or null without a bag size. */
export function brewsLeft(m: Pick<Model, 'avgDose'>, b: BeanView): number | null {
  return b.remaining == null ? null : b.remaining / bagDose(m, b);
}

/**
 * The day the open bag got down to about EMPTY_BREWS brews: the day of the brew that took it
 * there (in tz). Null while it has more, once it's empty, or when it isn't the open bag.
 */
export function emptyDay(m: Pick<Model, 'avgDose'>, b: BeanView, tz: string): string | null {
  const left = brewsLeft(m, b);
  if (b.status !== 'drinking' || !b.bag_g || left == null || b.remaining! <= 0) return null;
  if (left > EMPTY_BREWS) return null;
  const dose = bagDose(m, b);
  let used = 0;
  // Oldest first: the first brew after which it was down to EMPTY_BREWS.
  for (const x of [...b.brews].reverse()) {
    used += x.dose_g ?? 0;
    if ((b.bag_g - used) / dose <= EMPTY_BREWS) return dayIn(x.date, tz);
  }
  return dayIn(b.created, tz); // a bag that small from the start
}

/** "Kenya Gichathaini has about 2 brews left." */
export function emptyBody(name: string, left: number): string {
  const n = Math.max(1, Math.round(left));
  return `${name} has about ${n} ${n === 1 ? 'brew' : 'brews'} left.`;
}

export function emptyNotices(m: Pick<Model, 'beans' | 'avgDose'>, today: string, tz: string) {
  return m.beans
    .filter((b) => dueOn(emptyDay(m, b, tz), today))
    .map((b) => bagNotice('empty', b, emptyBody(b.name, brewsLeft(m, b)!)));
}

// Order arrived? --------------------------------------------------------------------------------

/**
 * The day a bag still on order was ordered. Bags have no "ordered on" date: they're added when
 * ordered, so it's the day the bag was added (created_at, in tz).
 */
export const orderedDay = (b: BeanView, tz: string) =>
  b.status === 'ordered' ? dayIn(b.created, tz) : null;

/** "Did Kenya Gichathaini arrive? Mark it as received." */
export const arrivedBody = (name: string) => `Did ${name} arrive? Mark it as received.`;

/** Due the day it's been on order more than ORDER_DAYS days. */
export function arrivedNotices(m: Pick<Model, 'beans'>, today: string, tz: string): Notice[] {
  return m.beans
    .filter((b) => {
      const d = orderedDay(b, tz);
      return d != null && dueOn(addDays(d, ORDER_DAYS + 1), today);
    })
    .map((b) => bagNotice('arrived', b, arrivedBody(b.name)));
}

// Freezer reminder ------------------------------------------------------------------------------

/**
 * The day a frozen bag went into the freezer. Bags have no "frozen on" date: received_on is the
 * closest (a bag is usually frozen the day it arrives), else the day it was added.
 */
export const frozenDay = (b: BeanView, tz: string) =>
  b.status === 'freezing' ? (b.received_on ?? dayIn(b.created, tz)) : null;

/** "Ethiopia Guji has been frozen for 3 months." */
export function freezerBody(name: string, days: number): string {
  const months = Math.floor(days / 30);
  return `${name} has been frozen for ${months} ${months === 1 ? 'month' : 'months'}.`;
}

/** Due the day it's been frozen more than FREEZER_DAYS days. */
export function freezerNotices(m: Pick<Model, 'beans'>, today: string, tz: string): Notice[] {
  const out: Notice[] = [];
  for (const b of m.beans) {
    const d = frozenDay(b, tz);
    if (d == null || !dueOn(addDays(d, FREEZER_DAYS + 1), today)) continue;
    out.push(bagNotice('freezer', b, freezerBody(b.name, dayDiff(d, today))));
  }
  return out;
}

/**
 * Everything but "Beans running low" (the worker tracks its spell) that a device in `tz` could
 * get at `now`. The worker drops any key the device already got, so each goes out once.
 */
export function dueNotices(m: Model, now: Date, tz: string): Notice[] {
  const today = dayIn(now, tz);
  const rate = rateNotice(m, today, hourIn(now, tz), tz);
  return [
    ...readyNotices(m, today),
    ...(rate ? [rate] : []),
    ...emptyNotices(m, today, tz),
    ...arrivedNotices(m, today, tz),
    ...freezerNotices(m, today, tz),
  ];
}
