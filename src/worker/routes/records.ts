// Roasters, beans (bags) and brews.
import { Hono } from 'hono';
import {
  beanInput,
  beanPatch,
  brewInput,
  brewPatch,
  roasterInput,
  roasterPatch,
} from '@shared/schemas';
import type { z } from 'zod';
import { dayIn } from '@shared/logic/tz';
import type { Bean } from '@shared/types';
import {
  encode,
  first,
  insertStmt,
  loadBeans,
  loadBrews,
  loadRoasters,
  loadSettings,
  newId,
  nowIso,
  updateStmt,
} from '../db';
import { deleteOwnerImages } from './images';
import { ApiError, body, defined, notFound, type AppEnv } from './util';

export const records = new Hono<AppEnv>();

async function exists(db: D1Database, table: string, id: string) {
  return !!(await first(db, `SELECT id FROM ${table} WHERE id = ?`, id));
}

async function checkRoaster(db: D1Database, id: string | null | undefined) {
  if (id && !(await exists(db, 'roasters', id)))
    throw new ApiError(400, 'invalid', 'That roaster no longer exists.');
}

async function checkBean(db: D1Database, id: string | null | undefined) {
  if (id && !(await exists(db, 'beans', id)))
    throw new ApiError(400, 'invalid', 'That bean no longer exists.');
}

// Roasters

records.post('/roasters', async (c) => {
  const input = await body(c, roasterInput);
  const id = newId();
  const now = nowIso();
  await insertStmt(c.env.DB, 'roasters', { id, ...input, created_at: now, updated_at: now }).run();
  return c.json((await loadRoasters(c.env.DB, id))[0], 201);
});

records.patch('/roasters/:id', async (c) => {
  const id = c.req.param('id');
  const input = defined(await body(c, roasterPatch));
  if (!(await exists(c.env.DB, 'roasters', id))) throw notFound('Roaster');
  if (Object.keys(input).length) await updateStmt(c.env.DB, 'roasters', id, input).run();
  return c.json((await loadRoasters(c.env.DB, id))[0]);
});

records.delete('/roasters/:id', async (c) => {
  const id = c.req.param('id');
  if (!(await exists(c.env.DB, 'roasters', id))) throw notFound('Roaster');
  // Its beans stay, with no roaster.
  await c.env.DB.prepare('DELETE FROM roasters WHERE id = ?').bind(id).run();
  await deleteOwnerImages(c.env, 'roaster', id);
  return c.json({ ok: true });
});

// Beans

records.post('/beans', async (c) => {
  const input = await body(c, beanInput);
  await checkRoaster(c.env.DB, input.roaster_id);
  if (input.status !== 'ordered' && !input.received_on) input.received_on = await today(c.env.DB);
  const id = newId();
  const now = nowIso();
  await insertStmt(c.env.DB, 'beans', {
    id,
    ...encode(input),
    roaster_id: input.roaster_id ?? null,
    buy_again: input.buy_again ?? null,
    created_at: now,
    updated_at: now,
  }).run();
  return c.json((await loadBeans(c.env.DB, id))[0], 201);
});

records.patch('/beans/:id', async (c) => {
  const id = c.req.param('id');
  const input: Partial<BeanFields> = defined(await body(c, beanPatch));
  const prev = (await loadBeans(c.env.DB, id))[0];
  if (!prev) throw notFound('Bean');
  await checkRoaster(c.env.DB, input.roaster_id);
  if (input.status && input.status !== prev.status) {
    Object.assign(input, statusDates(prev, input, await today(c.env.DB)));
  }
  if (Object.keys(input).length) await updateStmt(c.env.DB, 'beans', id, encode(input)).run();
  return c.json((await loadBeans(c.env.DB, id))[0]);
});

type BeanFields = z.output<typeof beanPatch>;

async function today(db: D1Database) {
  return dayIn(new Date(), (await loadSettings(db)).time_zone);
}

/**
 * Moving a bag along stamps the date it happened, unless the request sets it itself:
 * off the order list → received_on, out of the freezer → thawed_on, done → finished_on.
 */
export function statusDates(
  prev: Pick<Bean, 'status' | 'received_on' | 'thawed_on' | 'finished_on'>,
  input: Partial<BeanFields>,
  day: string,
): Partial<BeanFields> {
  const out: Partial<BeanFields> = {};
  const has = (k: keyof BeanFields) => k in input;
  const s = input.status;
  if (prev.status === 'ordered' && s !== 'ordered' && !prev.received_on && !has('received_on'))
    out.received_on = day;
  if (prev.status === 'freezing' && (s === 'resting' || s === 'drinking') && !has('thawed_on'))
    out.thawed_on = day;
  if (s === 'finished' && !prev.finished_on && !has('finished_on')) out.finished_on = day;
  if (prev.status === 'finished' && s !== 'finished' && !has('finished_on')) out.finished_on = null;
  return out;
}

records.delete('/beans/:id', async (c) => {
  const id = c.req.param('id');
  if (!(await exists(c.env.DB, 'beans', id))) throw notFound('Bean');
  // Brews with this bag go too (ON DELETE CASCADE); the app confirms first.
  await c.env.DB.prepare('DELETE FROM beans WHERE id = ?').bind(id).run();
  await deleteOwnerImages(c.env, 'bean', id);
  return c.json({ ok: true });
});

// Brews

records.post('/brews', async (c) => {
  const { brewed_at, ...input } = await body(c, brewInput);
  await checkBean(c.env.DB, input.bean_id);
  const id = newId();
  const now = nowIso();
  const fields: Record<string, unknown> = encode({
    id,
    ...input,
    extraction: input.extraction ?? null,
    strength: input.strength ?? null,
    brewed_at: brewed_at ? new Date(brewed_at).toISOString() : now,
    created_at: now,
    updated_at: now,
  });
  const cols = Object.keys(fields);
  // Brew numbers count up from 1, like the Airtable autonumber they replace.
  await c.env.DB.prepare(
    `INSERT INTO brews (num, ${cols.join(', ')})
     VALUES ((SELECT COALESCE(MAX(num), 0) + 1 FROM brews), ${cols.map(() => '?').join(', ')})`,
  )
    .bind(...cols.map((k) => fields[k]))
    .run();
  return c.json((await loadBrews(c.env.DB, id))[0], 201);
});

records.patch('/brews/:id', async (c) => {
  const id = c.req.param('id');
  const { brewed_at, ...rest } = defined(await body(c, brewPatch));
  if (!(await exists(c.env.DB, 'brews', id))) throw notFound('Brew');
  await checkBean(c.env.DB, rest.bean_id);
  const input: Record<string, unknown> = { ...rest };
  if (brewed_at) input.brewed_at = new Date(brewed_at).toISOString();
  if (Object.keys(input).length) await updateStmt(c.env.DB, 'brews', id, encode(input)).run();
  return c.json((await loadBrews(c.env.DB, id))[0]);
});

records.delete('/brews/:id', async (c) => {
  const id = c.req.param('id');
  if (!(await exists(c.env.DB, 'brews', id))) throw notFound('Brew');
  await c.env.DB.prepare('DELETE FROM brews WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
