import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from './defaultData';

describe('normalizeSettings', () => {
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
