import { afterEach, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0, effects: [] as (() => void | (() => void))[], deps: [] as unknown[][] }));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next; }];
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => { hooks.effects.push(effect); hooks.deps.push(deps); },
}));
vi.mock('../utils/vaultStore', () => ({ isPhotoStorageAvailable: () => true }));
vi.mock('../components/ui/feedback', () => ({ showToast: vi.fn() }));
vi.mock('../utils/photoStore', () => ({ listPhotos: vi.fn(), getSelectedSlot: vi.fn(), photoUrl: vi.fn(), setSelectedSlot: vi.fn(async () => {}), addPhoto: vi.fn(), removePhoto: vi.fn() }));
import * as store from '../utils/photoStore';
import { useBackgroundPhoto } from './useBackgroundPhoto';
const photo = { slot: 0, addedAt: '2026-10-22', luminance: 0.2, width: 800, height: 600 };
const render = () => { hooks.index = 0; hooks.effects = []; hooks.deps = []; return useBackgroundPhoto(); };
afterEach(() => { hooks.values = []; vi.restoreAllMocks(); vi.clearAllMocks(); });
it('loads device selection and revokes a URL that finishes after unmount', async () => {
  vi.mocked(store.listPhotos).mockResolvedValue([photo]);
  vi.mocked(store.getSelectedSlot).mockResolvedValue(0);
  render(); hooks.effects[0]();
  await vi.waitFor(() => expect(hooks.values[0]).toEqual([photo]));
  let finish!: (url: string) => void;
  vi.mocked(store.photoUrl).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const background = render();
  expect(background.meta).toEqual(photo);
  const cleanup = hooks.effects[1]() as () => void;
  cleanup();
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  finish('blob:late');
  await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:late'));
  expect(render().url).toBeNull();
});
it('releases a displayed photo URL on selection change or unmount', async () => {
  hooks.values = [[photo], 0, null];
  vi.mocked(store.photoUrl).mockResolvedValue('blob:current');
  render(); const cleanup = hooks.effects[1]() as () => void;
  await vi.waitFor(() => expect(hooks.values[2]).toBe('blob:current'));
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  cleanup(); expect(revoke).toHaveBeenCalledWith('blob:current');
});

it('keeps the selected URL when another slot is added or removed, but reloads a replacement', async () => {
  hooks.values = [[photo], 0, null];
  vi.mocked(store.photoUrl).mockResolvedValue('blob:selected');
  let previous: unknown[] | undefined;
  let cleanup: (() => void) | undefined;
  const update = () => {
    const background = render();
    const deps = hooks.deps[1];
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous![i]))) {
      cleanup?.(); cleanup = hooks.effects[1]() as () => void;
    }
    previous = deps;
    return background;
  };
  update();
  await vi.waitFor(() => expect(hooks.values[2]).toBe('blob:selected'));
  // IndexedDB returns fresh metadata objects when the photo list changes.
  hooks.values[0] = [{ ...photo }, { ...photo, slot: 1 }];
  expect(update().url).toBe('blob:selected');
  expect(store.photoUrl).toHaveBeenCalledTimes(1);
  vi.mocked(store.listPhotos).mockResolvedValue([{ ...photo }]);
  await update().remove(1);
  expect(update().url).toBe('blob:selected');
  expect(store.photoUrl).toHaveBeenCalledTimes(1);
  hooks.values[0] = [{ ...photo, addedAt: '2026-10-23' }];
  update();
  expect(store.photoUrl).toHaveBeenCalledTimes(2);
  await vi.waitFor(() => expect(hooks.values[2]).toBe('blob:selected'));
  cleanup?.();
});
