// A bag's timeline (its status changes, each on a day) and its rest clock.
//
// The rest clock: every day the beans weren't frozen (freezing pauses resting): from the roast day
// less freezer time, or, with no roast day, the timeline's days off order and out of the freezer.
// With a recommended rest it counts down to ready; without one it counts the days rested.
import type { BeanStatus } from '../lookups';
import { dayDiff } from './tz';

export interface BeanEvent {
  id: string;
  bean_id: string;
  status: BeanStatus;
  on_day: string;
  created_at: string;
}

/** Oldest first; on the same day, in the order they were made. */
export function sortEvents<T extends Pick<BeanEvent, 'on_day' | 'created_at'>>(evs: T[]): T[] {
  return [...evs].sort((a, b) =>
    a.on_day === b.on_day
      ? a.created_at.localeCompare(b.created_at)
      : a.on_day.localeCompare(b.on_day),
  );
}

/** One stretch of the timeline: a status from its day until the next change (or today). */
export interface Stretch {
  event: BeanEvent;
  status: BeanStatus;
  from: string;
  /** The day the next change happened, or null while it's the current status. */
  to: string | null;
  days: number;
}

export function stretches(evs: BeanEvent[], today: string): Stretch[] {
  const s = sortEvents(evs);
  return s.map((e, i) => {
    const to = s[i + 1]?.on_day ?? null;
    return {
      event: e,
      status: e.status,
      from: e.on_day,
      to,
      days: Math.max(0, dayDiff(e.on_day, to ?? today)),
    };
  });
}

/** Days spent in the freezer, counting only days after `since` (the roast day) when given. */
export function frozenDays(evs: BeanEvent[], today: string, since?: string | null): number {
  let n = 0;
  for (const st of stretches(evs, today)) {
    if (st.status !== 'freezing') continue;
    const from = since && st.from < since ? since : st.from;
    const to = st.to && st.to < today ? st.to : today;
    n += Math.max(0, dayDiff(from, to));
  }
  return n;
}

/**
 * Days the beans have rested: every day they weren't frozen, up to the first brew (`until`, else
 * today). From the roast day when it's known: transit, time on order and resting all count, less
 * freezer time. Without one, the days on the timeline that weren't on order or in the freezer.
 */
export function restedDays(roastedOn: string | null, evs: BeanEvent[], until: string): number {
  if (roastedOn) return Math.max(0, dayDiff(roastedOn, until) - frozenDays(evs, until, roastedOn));
  return stretches(evs, until)
    .filter((x) => x.status !== 'ordered' && x.status !== 'freezing')
    .reduce((n, x) => n + Math.max(0, dayDiff(x.from, x.to && x.to < until ? x.to : until)), 0);
}

export interface RestInfo {
  /**
   * countdown: it has a recommended rest, counted toward. count: no recommended rest, so just
   * the days it has rested.
   */
  mode: 'countdown' | 'count';
  /** Recommended rest in days (countdown only). */
  restDays: number | null;
  /** Days rested so far: every day not frozen (see restedDays). */
  rested: number;
  /** Days still to go; 0 once ready (countdown only). */
  left: number;
  ready: boolean;
  /** The day it is (or was) ready (countdown only). */
  readyDay: string | null;
  /** The day the bag last moved to resting, if it has. */
  restingSince: string | null;
  /** From the roast day (less freezer time), or from the timeline when there's no roast day. */
  from: 'roast' | 'timeline';
  roastedOn: string | null;
  /** Days in the freezer that don't count (after the roast day, when known). */
  frozen: number;
}

/**
 * The rest clock for a bag, or null when there's nothing to count from (no roast day and no
 * days rested on its timeline). With a recommended rest it counts down to ready; without one it
 * counts the days rested.
 */
export function restInfo(
  bean: { roasted_on: string | null; rest_days: number | null },
  evs: BeanEvent[],
  today: string,
  /** The day of its first brew: the clock stops there. */
  firstBrew?: string | null,
): RestInfo | null {
  const until = firstBrew && firstBrew < today ? firstBrew : today;
  const restingSince =
    sortEvents(evs)
      .filter((e) => e.status === 'resting')
      .at(-1)?.on_day ?? null;
  const from = bean.roasted_on ? 'roast' : 'timeline';
  const frozen = frozenDays(evs, until, bean.roasted_on);
  const rested = restedDays(bean.roasted_on, evs, until);
  if (!bean.roasted_on && !restingSince && rested === 0) return null;
  const base = { rested, restingSince, from, roastedOn: bean.roasted_on, frozen } as const;
  if (bean.rest_days == null)
    return { ...base, mode: 'count', restDays: null, left: 0, ready: false, readyDay: null };
  const restDays = bean.rest_days;
  const left = Math.max(0, restDays - rested);
  return {
    ...base,
    mode: 'countdown',
    restDays,
    left,
    ready: rested >= restDays,
    readyDay: readyOn(bean.roasted_on, restDays, frozen, evs, restingSince, today, rested),
  };
}

/**
 * The day the clock reaches the rest, on a fixed date: the roast day plus the rest plus freezer
 * days; or, with no roast day, the day it last started resting plus what was still to go then.
 */
function readyOn(
  roastedOn: string | null,
  restDays: number,
  frozen: number,
  evs: BeanEvent[],
  restingSince: string | null,
  today: string,
  rested: number,
): string {
  if (roastedOn) return addDay(roastedOn, restDays + frozen);
  if (!restingSince) return addDay(today, restDays - rested);
  return addDay(restingSince, restDays - restedDays(null, evs, restingSince));
}

function addDay(day: string, n: number): string {
  return new Date(Date.parse(day + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
}
