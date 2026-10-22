import { afterEach, expect, it, vi } from 'vitest';
import { previewAppearance } from './useAppearance';
import { DEFAULT_APPEARANCE } from '../utils/defaultData';
afterEach(() => vi.unstubAllGlobals());
it('previews resolved photo appearance without persisting settings or theme', () => {
  const vars = new Map<string, string>();
  vi.stubGlobal('document', { documentElement: { style: { setProperty: (key: string, value: string) => vars.set(key, value) } } });
  const setItem = vi.fn(); vi.stubGlobal('localStorage', { setItem });
  previewAppearance({ ...DEFAULT_APPEARANCE, dim: 0, blur: 9 }, { luminance: 0.19 });
  expect(vars.get('--dm-dim')).toBe('0.1');
  expect(vars.get('--dm-blur')).toBe('9px');
  expect(setItem).not.toHaveBeenCalled();
});
