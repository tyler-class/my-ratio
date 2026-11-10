import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { AppState, Bean, Brew, Roaster } from '../../src/shared/types';
import { session } from './helpers';

describe('records', () => {
  it('creates roasters, bags and numbered brews', async () => {
    const api = await session();
    const r = (
      await api.post<Roaster>('/roasters', { name: 'Counter Culture', location: 'Durham' })
    ).data;
    expect(r.name).toBe('Counter Culture');
    const b = await api.post<Bean>('/beans', {
      name: 'Hologram',
      roaster_id: r.id,
      origins: ['Ethiopia', 'Colombia', 'Ethiopia'],
      bag_g: 340,
      cost: 22,
    });
    expect(b.status).toBe(201);
    expect(b.data.status).toBe('resting');
    expect(b.data.received_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(b.data.origins).toEqual(['Ethiopia', 'Colombia']);

    const b1 = (await api.post<Brew>('/brews', { bean_id: b.data.id, dose_g: 20, water_ml: 320 }))
      .data;
    const b2 = (
      await api.post<Brew>('/brews', {
        bean_id: b.data.id,
        dose_g: 20,
        water_ml: 330,
        brewed_at: '2026-01-02T07:30:00-05:00',
      })
    ).data;
    expect(b2.num).toBe(b1.num + 1);
    expect(b2.brewed_at).toBe('2026-01-02T12:30:00.000Z');

    const bad = await api.post('/brews', { bean_id: 'nope', dose_g: 20 });
    expect(bad.status).toBe(400);
    const badRating = await api.post('/brews', { bean_id: b.data.id, rating: 11 });
    expect(badRating.status).toBe(400);

    const skipped = (await api.patch<Brew>(`/brews/${b1.id}`, { rating_skipped: true })).data;
    expect(skipped.rating_skipped).toBe(true);
    expect(b2.rating_skipped).toBe(false);

    // "received" was retired; old clients and backups land on resting.
    const old = await api.post<Bean>('/beans', { name: 'Old client', status: 'received' });
    expect(old.data.status).toBe('resting');
  });

  it('PATCH changes only what is sent, and stamps status dates', async () => {
    const api = await session();
    const b = (
      await api.post<Bean>('/beans', {
        name: 'Frozen bag',
        status: 'freezing',
        origins: ['Kenya'],
        process: 'Washed',
      })
    ).data;
    expect(b.received_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const renamed = (await api.patch<Bean>(`/beans/${b.id}`, { name: 'Kenya AA' })).data;
    expect(renamed).toMatchObject({ status: 'freezing', origins: ['Kenya'], process: 'Washed' });

    const thawed = (await api.patch<Bean>(`/beans/${b.id}`, { status: 'resting' })).data;
    expect(thawed.thawed_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const done = (await api.patch<Bean>(`/beans/${b.id}`, { status: 'finished', buy_again: 'yes' }))
      .data;
    expect(done.finished_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(done.buy_again).toBe('yes');
    const back = (await api.patch<Bean>(`/beans/${b.id}`, { status: 'drinking' })).data;
    expect(back.finished_on).toBeNull();
    const cleared = (await api.patch<Bean>(`/beans/${b.id}`, { process: '' })).data;
    expect(cleared.process).toBeNull();
  });

  it('deleting a bag deletes its brews; deleting a roaster keeps its bags', async () => {
    const api = await session();
    const r = (await api.post<Roaster>('/roasters', { name: 'Gone Roasters' })).data;
    const b = (await api.post<Bean>('/beans', { name: 'Doomed', roaster_id: r.id })).data;
    const brew = (await api.post<Brew>('/brews', { bean_id: b.id, dose_g: 15 })).data;
    const keep = (await api.post<Bean>('/beans', { name: 'Keeper', roaster_id: r.id })).data;

    expect((await api.del(`/roasters/${r.id}`)).status).toBe(200);
    const s1 = (await api.get<AppState>('/state')).data;
    expect(s1.beans.find((x) => x.id === keep.id)!.roaster_id).toBeNull();

    expect((await api.del(`/beans/${b.id}`)).status).toBe(200);
    const s2 = (await api.get<AppState>('/state')).data;
    expect(s2.brews.find((x) => x.id === brew.id)).toBeUndefined();
  });

  it('saves settings', async () => {
    const api = await session();
    const s = await api.patch('/settings', {
      grinders: ['Fellow Ode'],
      temp_unit: 'C',
      time_zone: 'America/New_York',
    });
    expect(s.data).toMatchObject({ grinders: ['Fellow Ode'], temp_unit: 'C', currency: 'USD' });
    expect((await api.patch('/settings', { currency: 'dollars' })).status).toBe(400);
    const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'grinders'").first();
    expect(row).toEqual({ value: '["Fellow Ode"]' });
  });

  it('keeps the currency as a code, and reads old free text as one', async () => {
    const api = await session();
    // A code in any case is saved upper-case, and marks the currency as chosen.
    const s = await api.patch<AppState['settings']>('/settings', { currency: 'jpy' });
    expect(s.data).toMatchObject({ currency: 'JPY', currency_set: true });
    // An older copy may have saved a symbol: it reads as its code.
    await env.DB.prepare("UPDATE settings SET value = '€' WHERE key = 'currency'").run();
    expect((await api.get<AppState>('/state')).data.settings.currency).toBe('EUR');
    await env.DB.prepare("UPDATE settings SET value = 'beans' WHERE key = 'currency'").run();
    expect((await api.get<AppState>('/state')).data.settings.currency).toBe('USD');
  });
});
