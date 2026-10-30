import { describe, expect, it } from 'vitest';
import { trustedTime } from './clock';

describe('trustedTime', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  it.each([
    ['2026-10-29T12:00:00Z', now - 86_400_000],
    ['2026-10-30T12:01:00Z', now + 60_000],
    ['2026-10-30T12:05:00Z', now + 300_000],
    ['2026-10-30T12:05:00.001Z', -Infinity],
    ['2027-10-30T12:00:00Z', -Infinity],
    ['garbage', -Infinity],
    ['', -Infinity],
  ])('ranks %s as %s', (value, expected) => {
    expect(trustedTime(value, now)).toBe(expected);
  });
  it('trusts a previously far-future stamp once real time passes it', () => {
    const value = '2027-10-30T12:00:00Z';
    expect(trustedTime(value, now)).toBe(-Infinity);
    expect(trustedTime(value, Date.parse('2027-10-30T12:01:00Z'))).toBe(Date.parse(value));
  });
});
