import { describe, expect, it } from 'vitest';
import { formatAge, formatDay, formatLongDate, formatShortDate } from './dateFormat';

describe('dateFormat', () => {
  const today = '2026-10-20';

  it('uses relative words next to today', () => {
    expect(formatDay('2026-10-20', today)).toBe('Today');
    expect(formatDay('2026-10-19', today)).toBe('Yesterday');
    expect(formatDay('2026-10-21', today)).toBe('Tomorrow');
  });

  it('uses a short weekday date otherwise, without ISO', () => {
    expect(formatDay('2026-10-16', today, 'en-GB')).toBe('Fri 16 Oct');
    expect(formatShortDate('2025-12-31', today, 'en-GB')).toBe('Wed 31 Dec 2025');
  });

  it('formats long dates and ages', () => {
    expect(formatLongDate('2026-10-20', 'en-GB')).toBe('Tuesday, 20 October 2026');
    expect(formatLongDate('2026-10-20', 'en-US')).toBe('Tuesday, October 20, 2026');
    expect(formatAge(1)).toBe('1 day old');
    expect(formatAge(6)).toBe('6 days old');
  });

  it('is stable across a daylight-saving change', () => {
    expect(formatDay('2026-03-28', '2026-03-29')).toBe('Yesterday');
  });
});
