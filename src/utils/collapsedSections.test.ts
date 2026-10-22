import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { kv, available } = vi.hoisted(() => ({ kv: new Map<string, unknown>(), available: vi.fn(() => true) }));
vi.mock('./vaultStore', () => ({
  isPhotoStorageAvailable: available,
  kvGetRaw: async (key: string) => kv.get(key),
  kvPutRaw: async (key: string, value: unknown) => { kv.set(key, value); },
}));
import { loadCollapsed, saveCollapsed } from './collapsedSections';

let local: Map<string, string>;
beforeEach(() => {
  kv.clear();
  available.mockReturnValue(true);
  local = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => { local.set(key, value); },
  });
});
afterEach(() => vi.unstubAllGlobals());

it('round-trips normalized section names through the device-only IndexedDB key', async () => {
  expect(await loadCollapsed()).toEqual(new Set());
  await saveCollapsed(new Set(['Work', 'WORK', 'Personal']));
  expect(kv.get('ui:collapsedSections')).toEqual(['work', 'personal']);
  expect(await loadCollapsed()).toEqual(new Set(['work', 'personal']));
  expect(local.size).toBe(0);
  await saveCollapsed(new Set());
  expect(await loadCollapsed()).toEqual(new Set());
});

it('round-trips section names using the daymark localStorage fallback', async () => {
  available.mockReturnValue(false);
  expect(await loadCollapsed()).toEqual(new Set());
  await saveCollapsed(new Set(['Work', 'Ideas']));
  expect(local.get('daymark_ui_collapsed')).toBe('["work","ideas"]');
  expect(await loadCollapsed()).toEqual(new Set(['work', 'ideas']));
  expect(kv.size).toBe(0);
});

it('ignores malformed saved data and normalizes existing mixed-case names', async () => {
  kv.set('ui:collapsedSections', ['Work', null, 42, 'WORK']);
  expect(await loadCollapsed()).toEqual(new Set(['work']));
  kv.set('ui:collapsedSections', {});
  expect(await loadCollapsed()).toEqual(new Set());
  available.mockReturnValue(false);
  local.set('daymark_ui_collapsed', 'broken json');
  expect(await loadCollapsed()).toEqual(new Set());
});
