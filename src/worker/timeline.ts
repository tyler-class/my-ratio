// A bag's timeline on the server: each status change is kept as an event with its day, the bag's
// status follows its latest event, and its rest_until (the day it's ready while resting) is kept
// in step with the rest clock (src/shared/logic/timeline.ts) so notifications can use it.
import { restInfo, sortEvents } from '@shared/logic/timeline';
import { dayDiff, dayIn } from '@shared/logic/tz';
import type { BeanStatus } from '@shared/lookups';
import { loadBeans, loadSettings, newId, nowIso } from './db';

export async function today(db: D1Database) {
  return dayIn(new Date(), (await loadSettings(db)).time_zone);
}

export function eventStmt(db: D1Database, beanId: string, status: BeanStatus, day: string) {
  return db
    .prepare(
      'INSERT INTO bean_events (id, bean_id, status, on_day, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(newId(), beanId, status, day, nowIso());
}

/**
 * After the bag or its timeline changes: while resting, its rest_until is the rest clock's ready
 * day. When the timeline itself was edited (`fromTimeline`), the bag's status becomes its latest
 * entry's; a status set directly stays as set.
 */
export async function syncBean(
  db: D1Database,
  beanId: string,
  { day, fromTimeline = false }: { day?: string; fromTimeline?: boolean } = {},
) {
  const bean = (await loadBeans(db, beanId))[0];
  if (!bean) return;
  const t = day ?? (await today(db));
  const latest = sortEvents(bean.events).at(-1);
  const status = fromTimeline && latest ? latest.status : bean.status;
  const rest = status === 'resting' ? restInfo(bean, bean.events, t) : null;
  // Ready day while resting with a recommended rest; none without one.
  const restUntil = status === 'resting' ? (rest?.readyDay ?? null) : bean.rest_until;
  if (status !== bean.status || restUntil !== bean.rest_until)
    await db
      .prepare('UPDATE beans SET status = ?, rest_until = ?, updated_at = ? WHERE id = ?')
      .bind(status, restUntil, nowIso(), beanId)
      .run();
}

/**
 * A "rest until" day given directly (by an assistant or an older client) becomes a recommended
 * rest: days from the roast day, else from the day it arrived, else from today.
 */
export function restDaysFrom(restUntil: string, from: string | null, day: string): number {
  return Math.min(365, Math.max(0, dayDiff(from ?? day, restUntil)));
}

/**
 * Fill timelines from the dates bags already carry (for backups made before v1.1). Mirrors
 * migrations/0004_bean_timeline.sql.
 */
export const BACKFILL_TIMELINE = [
  `INSERT INTO bean_events (id, bean_id, status, on_day, created_at)
   SELECT lower(hex(randomblob(16))), id, 'ordered', substr(created_at, 1, 10), strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+0 seconds') FROM beans
   WHERE status = 'ordered' OR (received_on IS NOT NULL AND received_on > substr(created_at, 1, 10))`,
  `INSERT INTO bean_events (id, bean_id, status, on_day, created_at)
   SELECT lower(hex(randomblob(16))), id,
     CASE WHEN thawed_on IS NOT NULL OR status = 'freezing' THEN 'freezing' ELSE 'resting' END,
     received_on, strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+1 seconds') FROM beans
   WHERE received_on IS NOT NULL AND status <> 'ordered'`,
  `INSERT INTO bean_events (id, bean_id, status, on_day, created_at)
   SELECT lower(hex(randomblob(16))), id, 'resting', thawed_on, strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+2 seconds') FROM beans
   WHERE thawed_on IS NOT NULL`,
  `INSERT INTO bean_events (id, bean_id, status, on_day, created_at)
   SELECT lower(hex(randomblob(16))), b.id, 'drinking', MAX(substr(MIN(r.brewed_at), 1, 10), COALESCE(b.received_on, '')), strftime('%Y-%m-%dT%H:%M:%fZ', b.created_at, '+3 seconds')
   FROM beans b JOIN brews r ON r.bean_id = b.id
   WHERE b.status IN ('drinking', 'finished') GROUP BY b.id`,
  `INSERT INTO bean_events (id, bean_id, status, on_day, created_at)
   SELECT lower(hex(randomblob(16))), id, 'finished', finished_on, strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+4 seconds') FROM beans
   WHERE finished_on IS NOT NULL AND status = 'finished'`,
  `INSERT INTO bean_events (id, bean_id, status, on_day, created_at)
   SELECT lower(hex(randomblob(16))), b.id, b.status, substr(b.updated_at, 1, 10), strftime('%Y-%m-%dT%H:%M:%fZ', b.updated_at, '+5 seconds')
   FROM beans b
   WHERE b.status IS NOT (SELECT e.status FROM bean_events e WHERE e.bean_id = b.id
     ORDER BY e.on_day DESC, e.created_at DESC LIMIT 1)`,
];
