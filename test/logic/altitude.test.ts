import { describe, expect, it } from 'vitest';
import { altitudeNum } from '../../src/client/lib/format';

describe('altitudeNum', () => {
  it('keeps just the number: the field label carries the unit', () => {
    expect(altitudeNum('1800m MASL')).toBe('1800');
    expect(altitudeNum('1,800 masl')).toBe('1800');
    expect(altitudeNum('1800 meters')).toBe('1800');
    expect(altitudeNum('1700-1900 m')).toBe('1700-1900');
    expect(altitudeNum('1900')).toBe('1900');
    expect(altitudeNum(null)).toBe('');
  });
});
