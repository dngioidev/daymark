import { afterEach, expect, it, vi } from 'vitest';
import { defaultDeviceName, getInstallId } from './deviceName';

afterEach(() => vi.unstubAllGlobals());

it.each([
  ['Android', 'Android browser'], ['iPhone', 'iPhone browser'], ['iPad', 'iPhone browser'],
  ['Windows NT', 'Windows browser'], ['Macintosh', 'Mac browser'], ['X11; Linux', 'Linux browser'],
])('names a %s browser', (userAgent, expected) => {
  vi.stubGlobal('navigator', { userAgent });
  expect(defaultDeviceName()).toBe(expected);
});

it('reuses the existing install id', () => {
  const values = new Map([['daymark_install_id', 'inst-existing']]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
  expect(getInstallId()).toBe('inst-existing');
});

it('persists a new install id without requiring a secure context', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
  const id = getInstallId();
  expect(id).toMatch(/^inst-[a-z0-9]+-[a-z0-9]+$/);
  expect(values.get('daymark_install_id')).toBe(id);
  expect(getInstallId()).toBe(id);
});
