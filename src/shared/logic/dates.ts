// Calendar days in the viewer's local time zone. Bean dates are plain YYYY-MM-DD;
// brew times are ISO instants shown in local time.

export const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MO = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const pad = (n: number) => (n < 10 ? '0' + n : '' + n);

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** Whole calendar days from a to b (DST-safe). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

export function dayLabel(d: Date, now: Date): string {
  const x = daysBetween(d, now);
  if (x === 0) return 'Today';
  if (x === 1) return 'Yesterday';
  return `${WD[d.getDay()]}, ${MO[d.getMonth()]} ${d.getDate()}`;
}

export function timeLabel(d: Date): string {
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'am' : 'pm'}`;
}

export const agoLabel = (n: number) => (n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);

export const inDays = (n: number) => (n === 1 ? '1 day' : `${n} days`);

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(d: Date): string {
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value ("2026-11-09T07:30", local time) as an ISO instant; null if blank or bad. */
export function brewedAt(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
