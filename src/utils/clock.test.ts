import { describe, expect, it } from 'vitest';
import { formatLocalDate, msUntilNextLocalMidnight, resolveToday } from './clock';

describe('clock', () => {
  it('formats local dates with zero padding', () => {
    expect(formatLocalDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('uses the override only when it is a valid date', () => {
    expect(resolveToday('2026-10-17', '2026-10-20')).toBe('2026-10-17');
    expect(resolveToday('', '2026-10-20')).toBe('2026-10-20');
    expect(resolveToday('garbage', '2026-10-20')).toBe('2026-10-20');
    expect(resolveToday(undefined, '2026-10-20')).toBe('2026-10-20');
  });

  it('computes time to next midnight', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 9, 20, 23, 0, 0))).toBe(60 * 60 * 1000);
    expect(msUntilNextLocalMidnight(new Date(2026, 9, 20, 0, 0, 0))).toBeGreaterThan(23 * 60 * 60 * 1000);
  });
});
