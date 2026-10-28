// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { loadPanePrefs, savePanePrefs, paneMode } from './notesPanes';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
it.each([[390, 'drawers'], [799, 'drawers'], [800, 'drawers'], [1099, 'drawers'], [1100, 'compactRelated'], [1279, 'compactRelated'], [1280, 'full'], [1440, 'full']])('paneMode(%s) is %s', (width, mode) => {
  expect(paneMode(Number(width))).toBe(mode);
});
it('persists both device preferences and rejects damaged values', () => {
  expect(loadPanePrefs()).toEqual({ tree: 'open', related: 'open' });
  savePanePrefs({ tree: 'min', related: 'open' });
  expect(loadPanePrefs()).toEqual({ tree: 'min', related: 'open' });
  localStorage.setItem('daymark_notes_panes', '{"tree":"bad"}');
  expect(loadPanePrefs()).toEqual({ tree: 'open', related: 'open' });
});
it('survives unavailable storage', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
  expect(loadPanePrefs()).toEqual({ tree: 'open', related: 'open' });
  expect(() => savePanePrefs({ tree: 'min', related: 'min' })).not.toThrow();
});
