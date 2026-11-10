import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { AppState, Bean, ImageRef } from '../../src/shared/types';
import { ORIGIN, session } from './helpers';

// 1×1 transparent PNG.
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  ),
  (c) => c.charCodeAt(0),
);

describe('images', () => {
  it('stores photos in R2 under the record key and serves them', async () => {
    const api = await session();
    const b = (await api.post<Bean>('/beans', { name: 'Photo bag' })).data;
    const up = await SELF.fetch(`${ORIGIN}/api/beans/${b.id}/images`, {
      method: 'POST',
      headers: {
        Cookie: api.cookie,
        Origin: ORIGIN,
        'Content-Type': 'image/png',
        'X-Filename': encodeURIComponent('bag front.png'),
        'X-Image-Width': '1',
        'X-Image-Height': '1',
      },
      body: PNG,
    });
    expect(up.status).toBe(201);
    const img = (await up.json()) as ImageRef;
    expect(img).toMatchObject({ width: 1, height: 1, content_type: 'image/png' });

    const row = await env.DB.prepare('SELECT r2_key, filename FROM images WHERE id = ?')
      .bind(img.id)
      .first<{ r2_key: string; filename: string }>();
    expect(row!.r2_key).toBe(`beans/${b.id}/${img.id}.png`);
    expect(row!.filename).toBe('bag front.png');
    expect(await env.IMAGES.head(row!.r2_key)).not.toBeNull();

    const state = (await api.get<AppState>('/state')).data;
    expect(state.beans.find((x) => x.id === b.id)!.images.map((i) => i.id)).toEqual([img.id]);

    const get = await SELF.fetch(`${ORIGIN}/api/images/${img.id}`, {
      headers: { Cookie: api.cookie },
    });
    expect(get.status).toBe(200);
    expect(get.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(PNG);
    const etag = get.headers.get('ETag')!;
    const again = await SELF.fetch(`${ORIGIN}/api/images/${img.id}`, {
      headers: { Cookie: api.cookie, 'If-None-Match': etag },
    });
    expect(again.status).toBe(304);

    // Unauthenticated requests can't read photos.
    expect((await SELF.fetch(`${ORIGIN}/api/images/${img.id}`)).status).toBe(401);

    // Deleting the bag removes its files.
    await api.del(`/beans/${b.id}`);
    expect(await env.IMAGES.head(row!.r2_key)).toBeNull();
  });

  it('rejects non-images and missing owners', async () => {
    const api = await session();
    const b = (await api.post<Bean>('/beans', { name: 'Another' })).data;
    const send = (path: string, type: string) =>
      SELF.fetch(`${ORIGIN}/api${path}`, {
        method: 'POST',
        headers: { Cookie: api.cookie, Origin: ORIGIN, 'Content-Type': type },
        body: PNG,
      });
    expect((await send(`/beans/${b.id}/images`, 'application/json')).status).toBe(415);
    // The type comes from the bytes, not the header: text labeled as a PNG is refused.
    const fake = await SELF.fetch(`${ORIGIN}/api/beans/${b.id}/images`, {
      method: 'POST',
      headers: { Cookie: api.cookie, Origin: ORIGIN, 'Content-Type': 'image/png' },
      body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });
    expect(fake.status).toBe(415);
    expect((await send(`/beans/nope/images`, 'image/png')).status).toBe(404);
    // Raw bodies are only allowed on the upload routes.
    expect((await send(`/roasters`, 'image/png')).status).toBe(415);
  });
});

describe('photo import and upload links', () => {
  it('imports base64 images and reads their size', async () => {
    const api = await session();
    const b = (await api.post<Bean>('/beans', { name: 'Base64 bag' })).data;
    const b64 = btoa(String.fromCharCode(...PNG));
    const res = await api.post<ImageRef>(`/beans/${b.id}/images/import`, {
      base64: `data:image/png;base64,${b64}`,
      filename: 'pixel.png',
    });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ width: 1, height: 1, content_type: 'image/png' });
    expect(
      (await api.post(`/beans/${b.id}/images/import`, { base64: btoa('not an image') })).status,
    ).toBe(415);
    expect((await api.post(`/beans/${b.id}/images/import`, {})).status).toBe(400);
  });

  it('lets a one-time link upload without signing in, then expires', async () => {
    const api = await session();
    const r = (await api.post<{ id: string }>('/roasters', { name: 'Link Roasters' })).data;
    const link = (
      await api.post<{ url: string; for: string }>('/upload-links', {
        owner_type: 'roaster',
        owner_id: r.id,
        replace: true,
      })
    ).data;
    expect(link.for).toBe('Link Roasters');
    const path = new URL(link.url).pathname;
    expect(path).toMatch(/^\/upload\/[A-Za-z0-9_-]{32}$/);

    const page = await SELF.fetch(`${ORIGIN}${path}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('Add a logo');
    expect(html).toContain('Link Roasters');
    expect(page.headers.get('Content-Security-Policy')).toMatch(/script-src 'nonce-/);

    const put = () =>
      SELF.fetch(`${ORIGIN}${path}`, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'image/png' },
        body: PNG,
      });
    expect((await put()).status).toBe(201);
    expect((await put()).status).toBe(201);
    // Replace mode keeps only the newest logo.
    const state = (await api.get<AppState>('/state')).data;
    expect(state.roasters.find((x) => x.id === r.id)!.images).toHaveLength(1);

    // Wrong tokens and expired links show the expired page.
    expect((await SELF.fetch(`${ORIGIN}/upload/${'x'.repeat(32)}`)).status).toBe(404);
    await env.DB.prepare("UPDATE upload_links SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    expect((await SELF.fetch(`${ORIGIN}${path}`)).status).toBe(404);
    expect((await put()).status).toBe(404);
  });

  it('requires a session to make links', async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/upload-links`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_type: 'bean', owner_id: 'x' }),
    });
    expect(res.status).toBe(401);
  });
});
