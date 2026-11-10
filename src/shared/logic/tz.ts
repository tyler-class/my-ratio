// Calendar dates and wall-clock times in a named time zone, for code that runs in the
// Worker (always UTC) but speaks in the owner's local time.

function parts(d: Date, tz: string): Record<string, string> {
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return parts(d, 'UTC');
  }
  return Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
}

/** YYYY-MM-DD for the given instant in tz. */
export function dayIn(d: Date, tz: string): string {
  const p = parts(d, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The hour (0–23) for the given instant in tz. */
export function hourIn(d: Date, tz: string): number {
  return Number(parts(d, tz).hour) % 24;
}

/** Milliseconds tz is ahead of UTC at instant d. */
function offsetMs(d: Date, tz: string): number {
  const p = parts(d, tz);
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/**
 * A timestamp from a person or assistant: ISO with an offset is taken as is; a bare
 * "YYYY-MM-DD HH:mm" (or "YYYY-MM-DDTHH:mm", or a date alone at 08:00) is wall time in tz.
 */
export function parseLocal(s: string, tz: string): Date | null {
  const t = s.trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?$/.exec(t);
  if (!m) return null;
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, m[4] ? +m[4] : 8, m[5] ? +m[5] : 0);
  // Two passes settle DST edges.
  let ts = guess - offsetMs(new Date(guess), tz);
  ts = guess - offsetMs(new Date(ts), tz);
  return new Date(ts);
}

/** "Wed, Nov 4, 7:05 AM" in tz. */
export function whenIn(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Whole days from day a to day b (both YYYY-MM-DD). */
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
}
