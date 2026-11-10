// Bean photos and roaster logos. Files live in R2 under a key that mirrors the record
// (beans/<id>/<image id>.jpg); D1 keeps the metadata and order.
import { Hono } from 'hono';
import { z } from 'zod';
import type { ImageRef } from '@shared/types';
import { all, first, newId, nowIso, toImage } from '../db';
import { ApiError, body, notFound, type AppEnv } from './util';

export const images = new Hono<AppEnv>();

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export type OwnerType = 'bean' | 'roaster';
export const TABLE: Record<OwnerType, string> = { bean: 'beans', roaster: 'roasters' };

export const imageKey = (owner: OwnerType, ownerId: string, imageId: string, ext: string) =>
  `${TABLE[owner]}/${ownerId}/${imageId}.${ext}`;

const intHeader = (v: string | undefined) => {
  const x = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(x) && x > 0 && x < 100_000 ? x : null;
};

/** The real type, from the file's first bytes, so a mislabeled upload can't slip through. */
export function sniffType(b: Uint8Array): string | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, j) => b[i + j] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  if (at(4, 0x66, 0x74, 0x79, 0x70) && at(8, 0x61, 0x76, 0x69, 0x66)) return 'image/avif';
  return null;
}

/** Width and height from a PNG, GIF or JPEG header; null when it can't tell. */
export function sniffSize(b: Uint8Array): { width: number; height: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (b[0] === 0x89 && b[1] === 0x50) return { width: v.getUint32(16), height: v.getUint32(20) };
    if (b[0] === 0x47 && b[1] === 0x49)
      return { width: v.getUint16(6, true), height: v.getUint16(8, true) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return null;
        const m = b[i + 1]!;
        const len = v.getUint16(i + 2);
        // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
          return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) };
        i += 2 + len;
      }
    }
  } catch {
    /* truncated header */
  }
  return null;
}

export interface StoreImage {
  owner: OwnerType;
  ownerId: string;
  bytes: ArrayBuffer;
  filename?: string | null;
  width?: number | null;
  height?: number | null;
  /** Remove the owner's other images afterwards (a new logo replaces the old). */
  replace?: boolean;
}

/** Validates, writes the file to R2 under the record's key, and records it in D1. */
export async function storeImage(env: Cloudflare.Env, a: StoreImage): Promise<ImageRef> {
  const db = env.DB;
  if (!(await first(db, `SELECT id FROM ${TABLE[a.owner]} WHERE id = ?`, a.ownerId)))
    throw notFound(a.owner === 'bean' ? 'Bean' : 'Roaster');
  if (!a.bytes.byteLength) throw new ApiError(400, 'invalid', 'The image is empty.');
  if (a.bytes.byteLength > MAX_IMAGE_BYTES)
    throw new ApiError(413, 'too_large', 'That image is too big (15 MB max).');
  const head = new Uint8Array(a.bytes, 0, Math.min(a.bytes.byteLength, 64 * 1024));
  const type = sniffType(head);
  if (!type) throw new ApiError(415, 'unsupported', 'Use a JPEG, PNG, WebP, GIF or AVIF image.');
  const size = a.width && a.height ? { width: a.width, height: a.height } : sniffSize(head);

  const id = newId();
  const key = imageKey(a.owner, a.ownerId, id, EXT[type]!);
  await env.IMAGES.put(key, a.bytes, { httpMetadata: { contentType: type } });
  const next = await first<{ n: number }>(
    db,
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM images WHERE owner_type = ? AND owner_id = ?',
    a.owner,
    a.ownerId,
  );
  try {
    await db
      .prepare(
        `INSERT INTO images (id, owner_type, owner_id, r2_key, content_type, filename, width, height, size, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        a.owner,
        a.ownerId,
        key,
        type,
        a.filename ? a.filename.slice(0, 200) : null,
        size?.width ?? null,
        size?.height ?? null,
        a.bytes.byteLength,
        next?.n ?? 0,
        nowIso(),
      )
      .run();
  } catch (e) {
    await env.IMAGES.delete(key);
    throw e;
  }
  if (a.replace) {
    const old = await all<{ id: string; r2_key: string }>(
      db,
      'SELECT id, r2_key FROM images WHERE owner_type = ? AND owner_id = ? AND id <> ?',
      a.owner,
      a.ownerId,
      id,
    );
    if (old.length) {
      await db
        .prepare('DELETE FROM images WHERE owner_type = ? AND owner_id = ? AND id <> ?')
        .bind(a.owner, a.ownerId, id)
        .run();
      await env.IMAGES.delete(old.map((o) => o.r2_key));
    }
  }
  return toImage((await first(db, 'SELECT * FROM images WHERE id = ?', id))!);
}

function upload(owner: OwnerType) {
  return images.post(`/${TABLE[owner]}/:id/images`, async (c) => {
    const declared = Number(c.req.header('Content-Length') ?? 0);
    if (declared > MAX_IMAGE_BYTES)
      throw new ApiError(413, 'too_large', 'That image is too big (15 MB max).');
    const filename = c.req.header('X-Filename');
    const img = await storeImage(c.env, {
      owner,
      ownerId: c.req.param('id'),
      bytes: await c.req.arrayBuffer(),
      filename: filename ? decodeURIComponent(filename) : null,
      width: intHeader(c.req.header('X-Image-Width')),
      height: intHeader(c.req.header('X-Image-Height')),
    });
    return c.json(img, 201);
  });
}

const importInput = z
  .object({
    url: z.url({ protocol: /^https?$/ }).optional(),
    base64: z.string().min(8).max(21_000_000).optional(),
    filename: z.string().max(200).optional(),
    replace: z.boolean().optional(),
  })
  .refine((v) => !!v.url !== !!v.base64, 'Send either url or base64.');

/** Bytes from a public image URL, refusing anything that isn't an image or is too big. */
async function fetchImage(url: string): Promise<ArrayBuffer> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'image/*' }, redirect: 'follow' });
  } catch {
    throw new ApiError(400, 'invalid', 'Could not reach that image URL.');
  }
  if (!res.ok) throw new ApiError(400, 'invalid', `That image URL answered ${res.status}.`);
  if (Number(res.headers.get('Content-Length') ?? 0) > MAX_IMAGE_BYTES)
    throw new ApiError(413, 'too_large', 'That image is too big (15 MB max).');
  return res.arrayBuffer();
}

function decodeBase64(s: string): ArrayBuffer {
  const clean = s.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  try {
    return Uint8Array.from(atob(clean), (ch) => ch.charCodeAt(0)).buffer;
  } catch {
    throw new ApiError(400, 'invalid', 'That is not valid base64.');
  }
}

/** Adds an image from a URL or base64 (JSON body). Used by assistants over MCP. */
function importRoute(owner: OwnerType) {
  return images.post(`/${TABLE[owner]}/:id/images/import`, async (c) => {
    const input = await body(c, importInput);
    const bytes = input.url ? await fetchImage(input.url) : decodeBase64(input.base64!);
    const filename =
      input.filename ??
      (input.url ? decodeURIComponent(new URL(input.url).pathname.split('/').pop() ?? '') : null);
    const img = await storeImage(c.env, {
      owner,
      ownerId: c.req.param('id'),
      bytes,
      filename: filename || null,
      replace: input.replace,
    });
    return c.json(img, 201);
  });
}
importRoute('bean');
importRoute('roaster');

upload('bean');
upload('roaster');

images.get('/images/:id', async (c) => {
  const row = await first<{ r2_key: string; content_type: string }>(
    c.env.DB,
    'SELECT r2_key, content_type FROM images WHERE id = ?',
    c.req.param('id'),
  );
  if (!row) throw notFound('Image');
  // An image id never points at different bytes, so the browser can keep it forever.
  const headers = new Headers({
    'Content-Type': row.content_type,
    'Cache-Control': 'private, max-age=31536000, immutable',
  });
  const obj = await c.env.IMAGES.get(row.r2_key, {
    onlyIf: { etagDoesNotMatch: c.req.header('If-None-Match')?.replace(/^W\/|"/g, '') ?? '' },
  });
  if (!obj) throw notFound('Image');
  headers.set('ETag', obj.httpEtag);
  if (!('body' in obj)) return new Response(null, { status: 304, headers });
  return new Response(obj.body, { headers });
});

images.delete('/images/:id', async (c) => {
  const row = await first<{ r2_key: string }>(
    c.env.DB,
    'SELECT r2_key FROM images WHERE id = ?',
    c.req.param('id'),
  );
  if (!row) throw notFound('Image');
  await c.env.DB.prepare('DELETE FROM images WHERE id = ?').bind(c.req.param('id')).run();
  await c.env.IMAGES.delete(row.r2_key);
  return c.json({ ok: true });
});

/** Removes every image a bean or roaster owns, rows and files. */
export async function deleteOwnerImages(env: Cloudflare.Env, owner: OwnerType, ownerId: string) {
  const rows = await all<{ r2_key: string }>(
    env.DB,
    'SELECT r2_key FROM images WHERE owner_type = ? AND owner_id = ?',
    owner,
    ownerId,
  );
  await env.DB.prepare('DELETE FROM images WHERE owner_type = ? AND owner_id = ?')
    .bind(owner, ownerId)
    .run();
  if (rows.length) await env.IMAGES.delete(rows.map((r) => r.r2_key));
}
