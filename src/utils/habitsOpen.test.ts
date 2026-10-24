import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { kv, available } = vi.hoisted(() => ({ kv: new Map<string, unknown>(), available: vi.fn(() => true) }));
vi.mock('./vaultStore', () => ({
  isPhotoStorageAvailable: available,
  kvGetRaw: async (key: string) => kv.get(key),
  kvPutRaw: async (key: string, value: unknown) => { kv.set(key, value); },
}));
import { loadHabitsOpen, saveHabitsOpen } from './habitsOpen';

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

it('habitsOpen defaults false and round-trips through the device kv key', async () => {
  expect(await loadHabitsOpen()).toBe(false);
  await saveHabitsOpen(true);
  expect(kv.get('ui:habitsOpen')).toBe(true);
  expect(await loadHabitsOpen()).toBe(true);
  await saveHabitsOpen(false);
  expect(await loadHabitsOpen()).toBe(false);
  expect(local.size).toBe(0);
});

it('habitsOpen defaults false and round-trips through localStorage fallback', async () => {
  available.mockReturnValue(false);
  expect(await loadHabitsOpen()).toBe(false);
  await saveHabitsOpen(true);
  expect(local.get('daymark_ui_habits_open')).toBe('true');
  expect(await loadHabitsOpen()).toBe(true);
  await saveHabitsOpen(false);
  expect(await loadHabitsOpen()).toBe(false);
  expect(kv.size).toBe(0);
});

it('treats malformed preferences as closed', async () => {
  kv.set('ui:habitsOpen', 'true');
  expect(await loadHabitsOpen()).toBe(false);
  available.mockReturnValue(false);
  local.set('daymark_ui_habits_open', 'broken json');
  expect(await loadHabitsOpen()).toBe(false);
});
