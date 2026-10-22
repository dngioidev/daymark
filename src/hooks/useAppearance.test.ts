import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE } from '../utils/defaultData';
import { useAppearance } from './useAppearance';

// Node has no DOM renderer: run the hook's effects at the React boundary.
vi.mock('react', () => ({ useMemo: (fn: () => unknown) => fn(), useLayoutEffect: (fn: () => void) => fn() }));
afterEach(() => vi.unstubAllGlobals());

it('applies theme, font and effective vars, and mirrors subsequent synced preferences', () => {
  const classes = new Set<string>();
  const vars = new Map<string, string>();
  const root = {
    classList: { toggle: (name: string, enabled: boolean) => enabled ? classes.add(name) : classes.delete(name) },
    style: { fontSize: '', setProperty: (key: string, value: string) => vars.set(key, value) },
  };
  const storage = new Map<string, string>();
  vi.stubGlobal('document', { documentElement: root });
  vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => storage.set(key, value) });
  const r = useAppearance({ ...DEFAULT_APPEARANCE, theme: 'dark', textSize: 'l' }, null);
  expect(classes.has('dark')).toBe(true);
  expect(root.style.fontSize).toBe('17.5px');
  expect(vars.get('--dm-accent')).toBe('#f59e0b');
  expect(storage.get('daymark_theme')).toBe('{"theme":"dark","textSize":"l"}');
  expect(r.headerBgOpaque).toBe('#0c0a09');
  expect(useAppearance({ ...DEFAULT_APPEARANCE, dim: 0 }, { luminance: 0.19 }).dim).toBe(10);
  expect(classes.has('dark')).toBe(false);
  expect(root.style.fontSize).toBe('16px');
  expect(vars.get('--dm-dim')).toBe('0.1');
  expect(storage.get('daymark_theme')).toBe('{"theme":"light","textSize":"m"}');
  vi.stubGlobal('localStorage', { setItem: () => { throw new Error('blocked'); } });
  expect(() => useAppearance(DEFAULT_APPEARANCE, null)).not.toThrow();
});
