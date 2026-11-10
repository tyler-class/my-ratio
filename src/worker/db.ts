import { DEFAULT_METHODS, normalizeStatus, type BeanStatus, type BuyAgain } from '@shared/lookups';
import { normalizeCurrency } from '@shared/currency';
import type { AppState, Bean, Brew, ImageRef, Roaster, Settings, TempUnit } from '@shared/types';
import { kitState } from './kit/telemetry';

export type Row = Record<string, unknown>;

export const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

export async function all<T = Row>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T[]> {
  const res = await db
    .prepare(sql)
    .bind(...binds)
    .all<T>();
  return res.results;
}

export async function first<T = Row>(
  db: D1Database,
  sql: string,
  ...binds: unknown[]
): Promise<T | null> {
  return db
    .prepare(sql)
    .bind(...binds)
    .first<T>();
}

/** UPDATE helper: only the given columns, plus updated_at. */
export function updateStmt(
  db: D1Database,
  table: string,
  id: string,
  fields: Record<string, unknown>,
) {
  const cols = Object.keys(fields);
  const sets = [...cols.map((c) => `${c} = ?`), 'updated_at = ?'].join(', ');
  return db
    .prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`)
    .bind(...cols.map((c) => fields[c]), nowIso(), id);
}

export function insertStmt(db: D1Database, table: string, fields: Record<string, unknown>) {
  const cols = Object.keys(fields);
  return db
    .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .bind(...cols.map((c) => fields[c]));
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
const arr = (v: unknown): string[] => {
  try {
    const p = JSON.parse(String(v ?? '[]'));
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
};

/** JSON-encodes string-array columns before they're written. */
export function encode<T extends Record<string, unknown>>(fields: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [
      k,
      Array.isArray(v) ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 1 : 0) : v,
    ]),
  );
}

export function toImage(r: Row): ImageRef {
  return {
    id: String(r.id),
    width: n(r.width),
    height: n(r.height),
    content_type: String(r.content_type),
  };
}

export function toRoaster(r: Row, images: ImageRef[] = []): Roaster {
  return {
    id: String(r.id),
    name: String(r.name),
    location: s(r.location),
    website: s(r.website),
    notes: s(r.notes),
    images,
    created_at: String(r.created_at),
  };
}

export function toBean(r: Row, images: ImageRef[] = []): Bean {
  return {
    id: String(r.id),
    name: String(r.name),
    roaster_id: s(r.roaster_id),
    status: normalizeStatus(String(r.status)) as BeanStatus,
    roasted_on: s(r.roasted_on),
    received_on: s(r.received_on),
    rest_until: s(r.rest_until),
    thawed_on: s(r.thawed_on),
    finished_on: s(r.finished_on),
    tasting_notes: s(r.tasting_notes),
    roaster_notes: s(r.roaster_notes),
    origins: arr(r.origins),
    varieties: arr(r.varieties),
    region: s(r.region),
    process: s(r.process),
    process_notes: s(r.process_notes),
    altitude: s(r.altitude),
    bag_g: n(r.bag_g),
    cost: n(r.cost),
    notes: s(r.notes),
    buy_again: (s(r.buy_again) as BuyAgain | null) ?? null,
    images,
    created_at: String(r.created_at),
  };
}

export function toBrew(r: Row): Brew {
  return {
    id: String(r.id),
    num: Number(r.num),
    bean_id: s(r.bean_id),
    brewed_at: String(r.brewed_at),
    method: s(r.method),
    grinder: s(r.grinder),
    grind: n(r.grind),
    dose_g: n(r.dose_g),
    water_ml: n(r.water_ml),
    water_temp_c: n(r.water_temp_c),
    recipe_notes: s(r.recipe_notes),
    rating: n(r.rating),
    extraction: (s(r.extraction) as Brew['extraction']) ?? null,
    strength: (s(r.strength) as Brew['strength']) ?? null,
    tasting_notes: s(r.tasting_notes),
    next_time: s(r.next_time),
    rating_skipped: !!r.rating_skipped,
  };
}

async function imagesByOwner(
  db: D1Database,
  ownerType: 'bean' | 'roaster',
  ownerId?: string,
): Promise<Map<string, ImageRef[]>> {
  const rows = await all(
    db,
    `SELECT * FROM images WHERE owner_type = ?${ownerId ? ' AND owner_id = ?' : ''} ORDER BY sort_order, created_at`,
    ...(ownerId ? [ownerType, ownerId] : [ownerType]),
  );
  const m = new Map<string, ImageRef[]>();
  for (const r of rows) {
    const k = String(r.owner_id);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(toImage(r));
  }
  return m;
}

export async function loadRoasters(db: D1Database, id?: string): Promise<Roaster[]> {
  const [rows, imgs] = await Promise.all([
    all(
      db,
      `SELECT * FROM roasters${id ? ' WHERE id = ?' : ''} ORDER BY name COLLATE NOCASE`,
      ...(id ? [id] : []),
    ),
    imagesByOwner(db, 'roaster', id),
  ]);
  return rows.map((r) => toRoaster(r, imgs.get(String(r.id)) ?? []));
}

export async function loadBeans(db: D1Database, id?: string): Promise<Bean[]> {
  const [rows, imgs] = await Promise.all([
    all(
      db,
      `SELECT * FROM beans${id ? ' WHERE id = ?' : ''} ORDER BY created_at DESC`,
      ...(id ? [id] : []),
    ),
    imagesByOwner(db, 'bean', id),
  ]);
  return rows.map((r) => toBean(r, imgs.get(String(r.id)) ?? []));
}

export async function loadBrews(db: D1Database, id?: string): Promise<Brew[]> {
  return (
    await all(
      db,
      `SELECT * FROM brews${id ? ' WHERE id = ?' : ''} ORDER BY brewed_at DESC, num DESC`,
      ...(id ? [id] : []),
    )
  ).map(toBrew);
}

/** Saved Insights layout; anything malformed is dropped so the client falls back to defaults. */
function panels(v: string | undefined): Settings['insights_layout'] {
  try {
    const p: unknown = JSON.parse(v ?? '[]');
    if (!Array.isArray(p)) return [];
    return p.flatMap((x: { id?: unknown; size?: unknown; hidden?: unknown }) =>
      typeof x?.id === 'string'
        ? [{ id: x.id, size: x.size === 'half' ? 'half' : 'full', hidden: x.hidden === true }]
        : [],
    );
  } catch {
    return [];
  }
}

export const DEFAULT_SETTINGS: Settings = {
  methods: DEFAULT_METHODS,
  grinders: [],
  temp_unit: 'F',
  currency: 'USD',
  currency_set: false,
  time_zone: 'UTC',
  insights_layout: [],
  telemetry: true,
  updates_set_up: false,
};

export async function loadSettings(db: D1Database): Promise<Settings> {
  const [rows, kit] = await Promise.all([
    all<{ key: string; value: string }>(db, 'SELECT key, value FROM settings'),
    kitState(db),
  ]);
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const list = (k: string, d: string[]) => (m.has(k) ? arr(m.get(k)) : d);
  return {
    methods: list('methods', DEFAULT_SETTINGS.methods),
    grinders: list('grinders', DEFAULT_SETTINGS.grinders),
    temp_unit: (m.get('temp_unit') as TempUnit | undefined) ?? DEFAULT_SETTINGS.temp_unit,
    // Older copies stored free text; read it as a code (symbols and names understood).
    currency: normalizeCurrency(m.get('currency') ?? DEFAULT_SETTINGS.currency),
    currency_set: m.has('currency'),
    time_zone: m.get('time_zone') ?? DEFAULT_SETTINGS.time_zone,
    insights_layout: panels(m.get('insights_layout')),
    telemetry: kit.telemetry,
    updates_set_up: kit.updates_set_up,
  };
}

export async function loadState(db: D1Database): Promise<AppState> {
  const [settings, roasters, beans, brews] = await Promise.all([
    loadSettings(db),
    loadRoasters(db),
    loadBeans(db),
    loadBrews(db),
  ]);
  return { settings, roasters, beans, brews };
}
