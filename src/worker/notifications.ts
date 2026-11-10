// Ratio's notifications on top of the Selfhost Kit's push (src/worker/kit/push.ts): "Beans running
// low" once per low spell, four once-per-bag ones and an evening "Rate your brew". The words and
// the rules are in src/shared/logic/notify.ts.
import { buildModel } from '@shared/logic/model';
import {
  beansLow,
  beansLowNotice,
  dueNotices,
  lowSince,
  NOTIFY_KINDS,
  type Notice,
} from '@shared/logic/notify';
import { first, loadState } from './db';
import {
  localDate,
  pushRoutes,
  runPushJob,
  type PushCandidate,
  type PushDevice,
  type PushJobOptions,
} from './kit/push';

const ICON = '/pwa-192x192.png';

/** Where the current low spell's start date is kept (a private setting: not in backups). */
export const LOW_SINCE_KEY = 'beans_low_since';

/**
 * The runway and the low spell, worked out once per run (not once per device). Moves the spell
 * along as it goes: starts one when the beans drop under two weeks, ends it when they recover.
 */
async function lowSpell(db: D1Database, now: Date) {
  const state = await loadState(db);
  const m = buildModel(state, now);
  const prev =
    (await first<{ value: string }>(db, 'SELECT value FROM settings WHERE key = ?', LOW_SINCE_KEY))
      ?.value ?? null;
  const since = lowSince(prev, beansLow(m), localDate(now, state.settings.time_zone));
  if (since !== prev)
    await (
      since
        ? db
            .prepare(
              'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            )
            .bind(LOW_SINCE_KEY, since)
        : db.prepare('DELETE FROM settings WHERE key = ?').bind(LOW_SINCE_KEY)
    ).run();
  return { m, runway: m.runway, since };
}

/** Whether this device already got this notice (on any day): a spell, a bag, a day. */
async function alreadySent(db: D1Database, device: PushDevice, kind: string, key: string) {
  return !!(await first(
    db,
    'SELECT 1 AS x FROM selfhost_push_sent WHERE device_id = ? AND kind = ? AND key = ? LIMIT 1',
    device.id,
    kind,
    key,
  ));
}

/** The notifications a device could get now (the model is worked out once per run). */
export function ratioPush(db: D1Database): Pick<PushJobOptions, 'build'> {
  let spell: ReturnType<typeof lowSpell> | null = null;
  return {
    async build(device: PushDevice, now: Date): Promise<PushCandidate[]> {
      const { m, runway, since } = await (spell ??= lowSpell(db, now));
      const all: Notice[] = [
        ...(since && runway != null ? [beansLowNotice(runway, since)] : []),
        ...dueNotices(m, now, device.tz),
      ];
      const out: PushCandidate[] = [];
      for (const n of all) {
        if (await alreadySent(db, device, n.kind, n.key)) continue;
        out.push({
          kind: n.kind,
          key: n.key,
          message: { title: n.title, body: n.body, url: n.url, tag: n.tag },
        });
      }
      return out;
    },
  };
}

/**
 * The hourly cron's notification run. Anything due that hasn't gone out yet is sent at any hour
 * from 8:00 local to midnight (no 21:00 cutoff): one turned on late in the evening still gets
 * today's. "Rate your brew" isn't due before 20:00 (notify.ts).
 */
export function runNotifications(db: D1Database, o: Partial<PushJobOptions> = {}) {
  return runPushJob(db, { ...ratioPush(db), icon: ICON, until: 24, ...o });
}

/** /api/push/*: behind Ratio's sign-in (mounted after the guard in app.ts). No badge. */
export const push = pushRoutes({
  title: 'Ratio',
  kinds: NOTIFY_KINDS.map((k) => k.id),
  icon: ICON,
  fallbackSubject: 'mailto:ratio@tylerclass.net',
});
