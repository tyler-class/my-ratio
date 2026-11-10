// App state, settings, backup and restore.
import { Hono } from 'hono';
import { settingsPatch } from '@shared/schemas';
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  PRIVATE_SETTINGS,
  TABLE_ORDER,
  isRatioExport,
  rowValues,
  type ExportRow,
  type RatioExport,
} from '@shared/exportFormat';
import { all, loadSettings, loadState } from '../db';
import { ApiError, body, type AppEnv } from './util';
import { setKitState } from '../kit/telemetry';

export const admin = new Hono<AppEnv>();

admin.get('/state', async (c) => c.json(await loadState(c.env.DB)));

admin.patch('/settings', async (c) => {
  const { telemetry, updates_set_up, ...input } = await body(c, settingsPatch);
  // These two live in the Selfhost Kit's own table, not in settings.
  if (telemetry !== undefined || updates_set_up !== undefined)
    await setKitState(c.env.DB, { telemetry, updates_set_up });
  const stmts = Object.entries(input)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) =>
      c.env.DB.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ).bind(k, typeof v === 'string' ? v : JSON.stringify(v)),
    );
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json(await loadSettings(c.env.DB));
});

export async function exportAll(db: D1Database): Promise<RatioExport> {
  const tables: RatioExport['tables'] = {};
  for (const t of TABLE_ORDER) {
    let rows = await all<ExportRow>(db, `SELECT * FROM ${t}`);
    if (t === 'settings') rows = rows.filter((r) => !PRIVATE_SETTINGS.includes(String(r.key)));
    tables[t] = rows;
  }
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    tables,
  };
}

/** Replaces all data with the export's rows in one atomic batch. */
export async function importAll(db: D1Database, data: RatioExport) {
  const stmts: D1PreparedStatement[] = [db.prepare('PRAGMA defer_foreign_keys = ON')];
  for (const t of [...TABLE_ORDER].reverse()) {
    stmts.push(
      t === 'settings'
        ? db
            .prepare(
              `DELETE FROM settings WHERE key NOT IN (${PRIVATE_SETTINGS.map(() => '?').join(',')})`,
            )
            .bind(...PRIVATE_SETTINGS)
        : db.prepare(`DELETE FROM ${t}`),
    );
  }
  for (const t of TABLE_ORDER) {
    for (const row of data.tables[t] ?? []) {
      if (t === 'settings' && PRIVATE_SETTINGS.includes(String(row.key))) continue;
      const { cols, vals } = rowValues(t, row);
      if (!cols.length) continue;
      stmts.push(
        db
          .prepare(
            `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          )
          .bind(...vals),
      );
    }
  }
  await db.batch(stmts);
}

admin.get('/export', async (c) => {
  const data = await exportAll(c.env.DB);
  const stamp = data.exported_at.slice(0, 10);
  return c.json(data, 200, {
    'Content-Disposition': `attachment; filename="ratio-backup-${stamp}.json"`,
  });
});

admin.post('/import', async (c) => {
  const raw = await c.req.json().catch(() => null);
  if (!isRatioExport(raw)) throw new ApiError(400, 'invalid', 'That file is not a Ratio backup.');
  if (raw.version > EXPORT_VERSION)
    throw new ApiError(
      400,
      'invalid',
      'That backup is from a newer version of Ratio. Update this instance first.',
    );
  try {
    await importAll(c.env.DB, raw);
  } catch (e) {
    throw new ApiError(400, 'invalid', `Could not restore that backup: ${(e as Error).message}`);
  }
  return c.json({ ok: true });
});
