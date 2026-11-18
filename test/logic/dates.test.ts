import { describe, expect, it } from 'vitest';
import { agoLabel, sinceLabel } from '../../src/shared/logic/dates';

describe('relative times', () => {
  it('counts calendar days compactly', () => {
    expect(agoLabel(0)).toBe('today');
    expect(agoLabel(1)).toBe('yesterday');
    expect(agoLabel(3)).toBe('3d ago');
    expect(agoLabel(21)).toBe('21d ago');
  });

  it('counts minutes and hours within the same day', () => {
    const now = new Date(2026, 10, 18, 15, 0);
    expect(sinceLabel(new Date(2026, 10, 18, 14, 59, 30), now)).toBe('just now');
    expect(sinceLabel(new Date(2026, 10, 18, 14, 55), now)).toBe('5m ago');
    expect(sinceLabel(new Date(2026, 10, 18, 12, 0), now)).toBe('3h ago');
  });

  it('falls back to days across midnight', () => {
    const now = new Date(2026, 10, 18, 1, 0);
    expect(sinceLabel(new Date(2026, 10, 17, 23, 0), now)).toBe('yesterday');
    expect(sinceLabel(new Date(2026, 10, 15, 9, 0), now)).toBe('3d ago');
  });
});
