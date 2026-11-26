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

    // The dose/water lock is kept on the brew: locked unless it was left free.
    expect(b2.ratio_lock).toBe(true);
    const free = (await api.patch<Brew>(`/brews/${b1.id}`, { ratio_lock: false })).data;
    expect(free.ratio_lock).toBe(false);

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

  it('keeps a timeline of status changes, and the bag follows edits to it', async () => {
    const api = await session();
    const b = (await api.post<Bean>('/beans', { name: 'Timeline', status: 'ordered' })).data;
    expect(b.events.map((e) => e.status)).toEqual(['ordered']);
    const frozen = (await api.patch<Bean>(`/beans/${b.id}`, { status: 'freezing' })).data;
    expect(frozen.events.map((e) => e.status)).toEqual(['ordered', 'freezing']);
    const rest = (await api.patch<Bean>(`/beans/${b.id}`, { status: 'resting', rest_days: 10 }))
      .data;
    expect(rest.events.map((e) => e.status)).toEqual(['ordered', 'freezing', 'resting']);
    expect(rest.rest_days).toBe(10);
    // Resting with no roast day: ready ten days after it started resting.
    const since = rest.events.at(-1)!.on_day;
    const ready = new Date(Date.parse(since + 'T00:00:00Z') + 10 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(rest.rest_until).toBe(ready);

    // A day can't move past its neighbours, and correcting one never changes the status.
    const lastId = rest.events.at(-1)!.id;
    expect((await api.patch(`/bean-events/${lastId}`, { on_day: '2000-01-01' })).status).toBe(400);
    const same = (await api.patch<Bean>(`/bean-events/${lastId}`, { on_day: since })).data;
    expect(same.status).toBe('resting');

    // Correct a day; remove the latest entry and the bag goes back to freezing.
    const moved = (
      await api.patch<Bean>(`/bean-events/${rest.events[0]!.id}`, { on_day: '2026-01-02' })
    ).data;
    expect(moved.events[0]!.on_day).toBe('2026-01-02');
    const back = (await api.del<Bean>(`/bean-events/${rest.events.at(-1)!.id}`)).data;
    expect(back.status).toBe('freezing');
    // Add one that happened before, by hand.
    const added = (
      await api.post<Bean>(`/beans/${b.id}/events`, { status: 'resting', on_day: '2030-01-01' })
    ).data;
    expect(added.status).toBe('resting');
    // The last entry can't go.
    for (const e of added.events.slice(1)) await api.del(`/bean-events/${e.id}`);
    expect((await api.del(`/bean-events/${added.events[0]!.id}`)).status).toBe(400);
  });

  it('logging a brew of a bag that isn’t open moves it to drinking', async () => {
    const api = await session();
    const b = (await api.post<Bean>('/beans', { name: 'Opens itself', status: 'resting' })).data;
    await api.post('/brews', { bean_id: b.id, dose_g: 18 });
    const st = (await api.get<AppState>('/state')).data;
    const now = st.beans.find((x) => x.id === b.id)!;
    expect(now.status).toBe('drinking');
    expect(now.events.map((e) => e.status)).toEqual(['resting', 'drinking']);
    // Another brew of the open bag adds nothing.
    await api.post('/brews', { bean_id: b.id, dose_g: 18 });
    const again = (await api.get<AppState>('/state')).data.beans.find((x) => x.id === b.id)!;
    expect(again.events).toHaveLength(2);
  });

  it('logging a last cup after marking a bag finished keeps it finished', async () => {
    const api = await session();
    const b = (await api.post<Bean>('/beans', { name: 'All gone', status: 'drinking' })).data;
    await api.patch(`/beans/${b.id}`, { status: 'finished' });
    await api.post('/brews', { bean_id: b.id, dose_g: 18 });
    const now = (await api.get<AppState>('/state')).data.beans.find((x) => x.id === b.id)!;
    expect(now.status).toBe('finished');
    expect(now.events.at(-1)?.status).toBe('finished');
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
