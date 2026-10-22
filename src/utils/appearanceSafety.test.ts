import { expect, it } from 'vitest';
import { normalizeSettings, DEFAULT_APPEARANCE, DEFAULT_SETTINGS } from './defaultData';
import { resolveAppearance } from './appearance';
import type { AppearanceSettings } from '../types/daymark';

const corrupt = {
  ...DEFAULT_APPEARANCE, dim: 120, blur: -2,
  light: { headerBg: 'auto', headerText: '#fff', pageText: 'red', accent: null, headerOpacity: 5 },
  dark: { headerBg: '#zzzzzz', headerText: 12, pageText: '#FFFFFF', accent: 'auto', headerOpacity: 150 },
} as unknown as AppearanceSettings;

it('normalizes malformed colours and clamps appearance ranges for both themes', () => {
  const a = normalizeSettings({ ...DEFAULT_SETTINGS, appearance: corrupt }).appearance!;
  expect(a.light).toEqual({ ...DEFAULT_APPEARANCE.light, headerOpacity: 40 });
  expect(a.dark).toEqual({ ...DEFAULT_APPEARANCE.dark, pageText: '#FFFFFF' });
  expect(a.dim).toBe(90);
  expect(a.blur).toBe(0);
  const nonfinite = normalizeSettings({ ...DEFAULT_SETTINGS, appearance: { ...corrupt, dim: NaN, blur: Infinity } }).appearance!;
  expect(nonfinite.dim).toBe(DEFAULT_APPEARANCE.dim);
  expect(nonfinite.blur).toBe(DEFAULT_APPEARANCE.blur);
});
it('resolves corrupt appearance defensively even without normalization', () => {
  for (const theme of ['light', 'dark'] as const) {
    const result = resolveAppearance({ ...corrupt, theme }, null);
    expect(result.headerBgOpaque).toMatch(/^#[0-9a-f]{6}$/i);
    expect(result.headerText).toMatch(/^#[0-9a-f]{6}$/i);
    expect(result.dim).toBe(90);
    expect(result.blur).toBe(0);
  }
});
