import { describe, expect, it } from 'vitest';
import type { RatioExport } from '../../src/shared/exportFormat';
import type { AppState, Bean, Brew, Roaster } from '../../src/shared/types';
import { session } from './helpers';

describe('backup', () => {
  it('exports and restores everything', async () => {
    const api = await session();
    const r = (await api.post<Roaster>('/roasters', { name: 'Backup Roasters' })).data;
    const b = (await api.post<Bean>('/beans', { name: 'Backup Bean', roaster_id: r.id })).data;
    await api.post<Brew>('/brews', { bean_id: b.id, dose_g: 18, water_ml: 300, rating: 8.5 });
    const exp = await api.get<RatioExport>('/export');
    expect(exp.status).toBe(200);
    expect(exp.data.format).toBe('ratio');
    expect(exp.data.tables.settings!.some((s) => s.key === 'session_salt')).toBe(false);
    const before = (await api.get<AppState>('/state')).data;

    await api.del(`/beans/${b.id}`);
    expect((await api.post('/import', exp.data)).status).toBe(200);
    const after = (await api.get<AppState>('/state')).data;
    expect(after.brews.length).toBe(before.brews.length);
    expect(after.beans.find((x) => x.id === b.id)!.name).toBe('Backup Bean');
    // The session survives a restore.
    expect((await api.get('/session')).status).toBe(200);

    expect((await api.post('/import', { format: 'duffel' })).status).toBe(400);
  });
});
