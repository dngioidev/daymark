// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { loadRailCollapsed, saveRailCollapsed } from './railPreference';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
it('defaults to expanded for missing or invalid data', () => {
  expect(loadRailCollapsed()).toBe(false);
  for (const value of ['true', 'invalid', 'null', '0']) {
    localStorage.setItem('daymark_rail_collapsed', value);
    expect(loadRailCollapsed()).toBe(false);
  }
});
it('remembers explicit minimize and expand choices locally', () => {
  saveRailCollapsed(true);
  expect(loadRailCollapsed()).toBe(true);
  saveRailCollapsed(false);
  expect(loadRailCollapsed()).toBe(false);
});
it('handles blocked reads and writes without breaking the app', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(loadRailCollapsed()).toBe(false);
  expect(() => saveRailCollapsed(true)).not.toThrow();
});
