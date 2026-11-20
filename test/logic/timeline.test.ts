import { describe, expect, it } from 'vitest';
import { frozenDays, restInfo, stretches, type BeanEvent } from '../../src/shared/logic/timeline';

const ev = (status: BeanEvent['status'], on_day: string, n = 0): BeanEvent => ({
  id: `${status}-${on_day}`,
  bean_id: 'b',
  status,
  on_day,
  created_at: `${on_day}T00:00:0${n}Z`,
});

describe('a bag’s timeline', () => {
  const evs = [
    ev('ordered', '2026-10-18'),
    ev('freezing', '2026-10-24'),
    ev('resting', '2026-11-13'),
  ];

  it('has stretches from each change to the next', () => {
    expect(stretches(evs, '2026-11-28').map((s) => [s.status, s.days, s.to])).toEqual([
      ['ordered', 6, '2026-10-24'],
      ['freezing', 20, '2026-11-13'],
      ['resting', 15, null],
    ]);
  });

  it('counts the rest from the roast, less the freezer', () => {
    // Roasted Oct 20: 39 days to Nov 28, 20 of them frozen → 19 rested.
    const r = restInfo({ roasted_on: '2026-10-20', rest_days: 21 }, evs, '2026-11-28')!;
    expect(r).toMatchObject({ from: 'roast', frozen: 20, rested: 19, left: 2, ready: false });
    expect(r.readyDay).toBe('2026-11-30');
    expect(r.restingSince).toBe('2026-11-13');
  });

  it('counts frozen days only after the roast', () => {
    expect(frozenDays(evs, '2026-11-28', '2026-11-01')).toBe(12);
  });

  it('without a roast day, counts every day off order and out of the freezer', () => {
    // Resting 2 days, a week frozen, then resting 10 days: 12 rested.
    const tl = [
      ev('ordered', '2026-10-01'),
      ev('resting', '2026-10-05'),
      ev('freezing', '2026-10-07'),
      ev('resting', '2026-10-14'),
    ];
    const r = restInfo({ roasted_on: null, rest_days: 14 }, tl, '2026-10-24')!;
    expect(r).toMatchObject({ mode: 'countdown', from: 'timeline', rested: 12, left: 2 });
    // It had 2 of 14 when it came out on Oct 14, so 12 more: Oct 26.
    expect(r.readyDay).toBe('2026-10-26');
  });

  it('counts the days rested, across the whole timeline, with no recommended rest', () => {
    const r = restInfo({ roasted_on: '2026-10-20', rest_days: null }, evs, '2026-11-28')!;
    // From the roast (Oct 20): 39 days, 20 of them frozen.
    expect(r).toMatchObject({
      mode: 'count',
      rested: 19,
      readyDay: null,
      restingSince: '2026-11-13',
    });
  });

  it('counts transit and time on order from the roast, and stops at the first brew', () => {
    // Roasted Oct 1, ordered Oct 3, arrived and rested Oct 8, first brew Oct 20: 19 days.
    const tl = [ev('ordered', '2026-10-03'), ev('resting', '2026-10-08')];
    const r = restInfo(
      { roasted_on: '2026-10-01', rest_days: 21 },
      tl,
      '2026-11-30',
      '2026-10-20',
    )!;
    expect(r).toMatchObject({ rested: 19, frozen: 0, ready: false });
  });

  it('has nothing to count from before resting, without a roast day', () => {
    expect(restInfo({ roasted_on: null, rest_days: 10 }, evs.slice(0, 2), '2026-11-01')).toBeNull();
  });
});
