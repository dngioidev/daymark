import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig refresh TTL', () => {
  it('reads DAYMARK_REFRESH_TTL_DAYS', () => {
    expect(loadConfig({ DAYMARK_REFRESH_TTL_DAYS: '14' }).refreshTtlDays).toBe(14);
  });

  it.each([undefined, '', 'invalid', '0', '-5', 'Infinity', '1e400', 'abc'])('defaults to 30 days for %s', (value) => {
    expect(loadConfig({ DAYMARK_REFRESH_TTL_DAYS: value }).refreshTtlDays).toBe(30);
  });

  it('ignores the legacy token TTL setting', () => {
    expect(loadConfig({ DAYMARK_TOKEN_TTL_DAYS: '90' }).refreshTtlDays).toBe(30);
  });
});
