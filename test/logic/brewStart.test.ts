import { describe, expect, it } from 'vitest';
import { defaultBean, startFor } from '../../src/shared/logic/brewStart';
import type { BeanView, BrewView } from '../../src/shared/logic/model';

const brew = (id: string, rating: number | null, day: number, method = 'V60') =>
  ({ id, rating, method, date: new Date(2026, 10, day) }) as unknown as BrewView;
const bean = (id: string, status: string, brews: BrewView[]) => {
  const rated = brews.filter((b) => b.rating != null);
  let best: BrewView | null = null;
  for (const x of rated) if (!best || x.rating! > best.rating!) best = x;
  return { id, status, brews, best, last: brews[0] ?? null } as unknown as BeanView;
};

describe('where a new brew starts', () => {
  it('picks the bag only when exactly one is being drunk', () => {
    const a = bean('a', 'drinking', [brew('a1', 7, 10)]);
    const b = bean('b', 'drinking', [brew('b1', 7, 15)]);
    const c = bean('c', 'resting', []);
    expect(defaultBean({ beans: [a, c] })?.id).toBe('a');
    expect(defaultBean({ beans: [a, b, c] })).toBeNull();
    expect(defaultBean({ beans: [c] })).toBeNull();
  });

  it('starts from the best brew once one worked (7+), else the last, else nothing', () => {
    const good = bean('g', 'drinking', [brew('g2', 5, 12), brew('g1', 8, 10)]);
    expect(startFor(good)).toMatchObject({ why: 'best', brew: { id: 'g1' } });
    const dialing = bean('d', 'drinking', [brew('d2', 6, 12), brew('d1', 5, 10)]);
    expect(startFor(dialing)).toMatchObject({ why: 'last', brew: { id: 'd2' } });
    expect(startFor(bean('f', 'drinking', []))).toEqual({ why: 'fresh', brew: null });
  });
});
