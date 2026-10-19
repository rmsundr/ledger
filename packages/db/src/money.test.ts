import { describe, expect, it } from 'vitest';
import { fromMinorUnits, toMinorUnits } from './money.js';

describe('money', () => {
  it('converts major to minor without floats', () => {
    expect(toMinorUnits('100.50')).toBe(10050n);
    expect(toMinorUnits('-1.05')).toBe(-105n);
    expect(toMinorUnits('0.01')).toBe(1n);
  });

  it('formats minor units as decimal strings', () => {
    expect(fromMinorUnits(10050n)).toBe('100.50');
    expect(fromMinorUnits(-105n)).toBe('-1.05');
  });

  it('rejects invalid input', () => {
    expect(() => toMinorUnits('abc')).toThrow();
  });
});
