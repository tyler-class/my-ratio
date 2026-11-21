import { describe, expect, it } from 'vitest';
import { fmtInt, fmtN, plural } from '@shared/logic/units';

describe('number formatting', () => {
  it('groups thousands and keeps one decimal where there is one', () => {
    expect(fmtN(1733)).toBe('1,733');
    expect(fmtN(16.5)).toBe('16.5');
    expect(fmtN(1250.25)).toBe('1,250.3');
    expect(fmtN(null)).toBe('–');
    expect(fmtInt(3433.4)).toBe('3,433');
    expect(plural(1, 'brew')).toBe('1 brew');
    expect(plural(1204, 'brew')).toBe('1,204 brews');
  });
});
