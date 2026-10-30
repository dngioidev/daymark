import { describe, expect, it } from 'vitest';
import { countCountedDays, isCountedDay, normalizeCountingDays, resolveAlertDays } from './alertDays';
import type { CountingDays } from '../types/daymark';

describe('countCountedDays', () => {
  it.each<[string, string, CountingDays, number]>([
    ['2026-10-23', '2026-10-30', 'all', 7],
    ['2026-10-30', '2026-11-02', 'weekdays', 1],
    ['2026-10-31', '2026-11-02', 'weekdays', 1],
    ['2026-10-31', '2026-11-01', 'weekdays', 0],
    ['2026-11-02', '2026-11-09', 'weekdays', 5],
    ['2026-10-30', '2026-11-02', 'weekend', 2],
    ['2026-11-02', '2026-11-06', 'weekend', 0],
    ['2026-03-07', '2026-03-10', 'all', 3],
    ['2026-10-31', '2026-11-03', 'all', 3],
    ['2026-10-24', '2026-10-27', 'all', 3],
    ['2026-12-31', '2027-01-02', 'all', 2],
    ['2028-02-28', '2028-03-01', 'all', 2],
  ])('counts (%s, %s] in %s mode as %i', (from, to, mode, expected) => {
    expect(countCountedDays(from, to, mode)).toBe(expected);
  });

  it.each<CountingDays>(['all', 'weekdays', 'weekend'])('returns zero for equal or reversed dates in %s mode', mode => {
    expect(countCountedDays('2026-11-02', '2026-11-02', mode)).toBe(0);
    expect(countCountedDays('2026-11-02', '2026-10-30', mode)).toBe(0);
  });
});

describe('isCountedDay', () => {
  it.each<[string, CountingDays, boolean]>([
    ['2026-11-02', 'weekdays', true],
    ['2026-11-01', 'weekdays', false],
    ['2026-10-31', 'weekdays', false],
    ['2026-11-01', 'weekend', true],
    ['2026-10-31', 'weekend', true],
    ['2026-11-02', 'weekend', false],
    ['2026-11-01', 'all', true],
    ['2026-11-02', 'all', true],
  ])('classifies %s in %s mode as %s', (date, mode, expected) => {
    expect(isCountedDay(date, mode)).toBe(expected);
  });
});

describe('normalizeCountingDays', () => {
  it.each(['all', 'weekdays', 'weekend'] as const)('keeps %s', mode => {
    expect(normalizeCountingDays(mode)).toBe(mode);
  });
  it.each(['Mon-Fri', null, 42, undefined, {}, ''])('defaults %j to all', value => {
    expect(normalizeCountingDays(value)).toBe('all');
  });
});

describe('resolveAlertDays', () => {
  it('defaults absent settings without adding a stored field', () => {
    const settings = {};
    expect(resolveAlertDays(settings)).toEqual({ tasks: 'all', habits: 'all' });
    expect(settings).not.toHaveProperty('alertDays');
  });
  it('normalizes each choice independently', () => {
    expect(resolveAlertDays({ alertDays: { tasks: 'x' as never, habits: 'weekend' } }))
      .toEqual({ tasks: 'all', habits: 'weekend' });
    expect(resolveAlertDays({ alertDays: { tasks: 'weekdays', habits: undefined as never } }))
      .toEqual({ tasks: 'weekdays', habits: 'all' });
  });
});
