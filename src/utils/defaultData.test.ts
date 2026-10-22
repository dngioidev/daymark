import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, DEFAULT_SETTINGS, normalizeSettings } from './defaultData';
import { toSyncedSettings } from '../sync/merge';
import type { AppSettings } from '../types/daymark';

describe('normalizeSettings', () => {
  it('fills missing and partial appearance, including older backup settings', () => {
    const { appearance: _appearance, ...older } = DEFAULT_SETTINGS;
    expect(normalizeSettings(older).appearance).toEqual(DEFAULT_APPEARANCE);
    const partial = { ...older, appearance: { theme: 'dark', light: { headerOpacity: 70 } } } as AppSettings;
    expect(normalizeSettings(partial).appearance).toEqual({
      ...DEFAULT_APPEARANCE, theme: 'dark', light: { ...DEFAULT_APPEARANCE.light, headerOpacity: 70 },
    });
  });
  it('keeps appearance through normalization, a statuses edit and sync serialization', () => {
    const custom = { ...DEFAULT_APPEARANCE, dim: 60, light: { ...DEFAULT_APPEARANCE.light, accent: '#123456' } };
    const s = normalizeSettings({ ...DEFAULT_SETTINGS, appearance: custom });
    const edited = { ...s, statuses: [] };
    expect(edited.appearance).toEqual(custom);
    expect(toSyncedSettings(edited).appearance).toEqual(custom);
  });
  it('restores default sections when an older vault has none', () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, defaultHeadings: [] }).defaultHeadings).toEqual([
      'Work', 'Meetings', 'Ideas', 'Attention',
    ]);
  });

  it('keeps custom sections and preserves identity when settings need no repair', () => {
    const settings = { ...DEFAULT_SETTINGS, defaultHeadings: ['Deep work'] };
    expect(normalizeSettings(settings)).toBe(settings);
    expect(normalizeSettings(settings).defaultHeadings).toEqual(['Deep work']);
  });
});
