// The backup format: raw rows per table, in insert order (parents first).
// Image files stay in R2; a backup carries their metadata so restoring into the same
// deployment keeps photos attached.

export const EXPORT_FORMAT = 'ratio';
export const EXPORT_VERSION = 1;

export const TABLE_COLUMNS = {
  settings: ['key', 'value'],
  roasters: ['id', 'name', 'location', 'website', 'notes', 'created_at', 'updated_at'],
  beans: [
    'id',
    'name',
    'roaster_id',
    'status',
    'roasted_on',
    'received_on',
    'rest_until',
    'thawed_on',
    'finished_on',
    'tasting_notes',
    'roaster_notes',
    'origins',
    'varieties',
    'region',
    'process',
    'process_notes',
    'altitude',
    'bag_g',
    'cost',
    'notes',
    'buy_again',
    'created_at',
    'updated_at',
  ],
  brews: [
    'id',
    'num',
    'bean_id',
    'brewed_at',
    'method',
    'grinder',
    'grind',
    'dose_g',
    'water_ml',
    'water_temp_c',
    'recipe_notes',
    'rating',
    'extraction',
    'strength',
    'tasting_notes',
    'next_time',
    'rating_skipped',
    'created_at',
    'updated_at',
  ],
  images: [
    'id',
    'owner_type',
    'owner_id',
    'r2_key',
    'content_type',
    'filename',
    'width',
    'height',
    'size',
    'sort_order',
    'created_at',
  ],
} as const;

export type TableName = keyof typeof TABLE_COLUMNS;
export const TABLE_ORDER = Object.keys(TABLE_COLUMNS) as TableName[];
/**
 * Never exported or overwritten: the session salt is per deployment, and the "beans running low"
 * spell goes with this copy's notifications (src/worker/notifications.ts).
 */
export const PRIVATE_SETTINGS = ['session_salt', 'beans_low_since'];

export type Cell = string | number | null;
export type ExportRow = Record<string, Cell | boolean | undefined>;

export interface RatioExport {
  format: typeof EXPORT_FORMAT;
  version: number;
  exported_at: string;
  tables: Partial<Record<TableName, ExportRow[]>>;
}

export function isRatioExport(v: unknown): v is RatioExport {
  const o = v as RatioExport;
  return (
    !!o &&
    o.format === EXPORT_FORMAT &&
    typeof o.version === 'number' &&
    !!o.tables &&
    typeof o.tables === 'object'
  );
}

/** Column names and values for one row, keeping only known columns. */
export function rowValues(table: TableName, row: ExportRow): { cols: string[]; vals: Cell[] } {
  const cols: string[] = [];
  const vals: Cell[] = [];
  for (const c of TABLE_COLUMNS[table]) {
    if (c in row) {
      const v = row[c];
      cols.push(c);
      vals.push(v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
    }
  }
  return { cols, vals };
}

function sqlLiteral(v: Cell): string {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${v.replace(/'/g, "''")}'`;
}

/** Plain SQL inserts for `wrangler d1 execute --file`. Does not delete existing rows. */
export function exportToSql(data: RatioExport): string {
  const lines: string[] = ['PRAGMA defer_foreign_keys = ON;'];
  for (const table of TABLE_ORDER) {
    for (const row of data.tables[table] ?? []) {
      const { cols, vals } = rowValues(table, row);
      lines.push(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.map(sqlLiteral).join(', ')});`,
      );
    }
  }
  return lines.join('\n') + '\n';
}
