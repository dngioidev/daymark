import { describe, expect, it } from 'vitest';
import { appearanceVars, decideInitialAppearance, resolveAppearance } from './appearance';
import { DEFAULT_APPEARANCE } from './defaultData';
import { contrastRatio } from './color';

describe('appearance resolution', () => {
  it.each(['light', 'dark'] as const)('auto colours on defaults meet 4.5:1 in %s', (theme) => {
    const r = resolveAppearance({ ...DEFAULT_APPEARANCE, theme }, null);
    const page = theme === 'light' ? '#fafaf9' : '#0c0a09';
    expect(contrastRatio(r.headerText, r.headerBgOpaque)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(r.pageText, page)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(r.accent, page)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(r.accentText, r.accent)).toBeGreaterThanOrEqual(4.5);
    expect(r.accent).toBe(theme === 'light' ? '#b45309' : '#f59e0b');
    expect(r.warnings).toEqual([]);
  });
  it('custom low-contrast colours are kept but reported', () => {
    const r = resolveAppearance({ ...DEFAULT_APPEARANCE, light: {
      ...DEFAULT_APPEARANCE.light, headerText: '#eeeeee', pageText: '#eeeeee', accent: '#eeeeee',
    } }, null);
    expect(r.headerText).toBe('#eeeeee');
    expect(r.pageText).toBe('#eeeeee');
    expect(r.accent).toBe('#eeeeee');
    expect(r.warnings.map((w) => w.field)).toEqual(['headerText', 'pageText', 'accent']);
    expect(r.warnings.every((w) => w.ratio < 4.5)).toBe(true);
  });
  it.each([['s', 15], ['m', 16], ['l', 17.5]] as const)('maps text size %s to %s px', (textSize, px) => {
    expect(resolveAppearance({ ...DEFAULT_APPEARANCE, textSize }, null).rootFontPx).toBe(px);
  });
  it('composites the header and exposes opaque hex separately from display alpha', () => {
    const r = resolveAppearance({ ...DEFAULT_APPEARANCE, light: {
      ...DEFAULT_APPEARANCE.light, headerBg: '#000000', headerOpacity: 50,
    } }, null);
    expect(r.headerBg).toBe('rgb(0 0 0 / 0.5)');
    expect(r.headerBgOpaque).toBe('#7d7d7d');
    expect(r.headerBgOpaque).toMatch(/^#[0-9a-f]{6}$/);
    expect(r.headerBgOpaque).toHaveLength(7);
    expect(contrastRatio(r.headerText, r.headerBgOpaque)).toBeGreaterThanOrEqual(4.5);
  });
  it('raises dim in steps of five when neither automatic page colour is readable', () => {
    // Linear luminance 0.19 encodes to about sRGB 121; both white and stone fail.
    const a = { ...DEFAULT_APPEARANCE, dim: 0 };
    const r = resolveAppearance(a, { luminance: 0.19 });
    expect(r.dim).toBe(10);
    expect(r.pageText).toBe('#1c1917');
    expect(contrastRatio('#1c1917', '#808080')).toBeLessThan(4.5);
    expect(contrastRatio(r.pageText, '#868686')).toBeGreaterThanOrEqual(4.5);
    expect(a.dim).toBe(0);
  });
  it.each([0, 1])('keeps automatic text readable over photo luminance %s', (luminance) => {
    const r = resolveAppearance(DEFAULT_APPEARANCE, { luminance });
    expect(r.warnings).toEqual([]);
    expect(r.dim).toBe(35);
  });
  it('provides the public CSS variables including the effective dim', () => {
    const r = resolveAppearance(DEFAULT_APPEARANCE, null);
    expect(appearanceVars(r)).toEqual({
      '--dm-header-bg': r.headerBg, '--dm-header-fg': r.headerText,
      '--dm-page-fg': r.pageText, '--dm-accent': r.accent, '--dm-accent-fg': r.accentText,
      '--dm-dim': '0.35', '--dm-blur': '4px',
    });
  });
  it('uses system theme only for an existing vault upgrade', () => {
    expect(decideInitialAppearance(true, true).theme).toBe('dark');
    expect(decideInitialAppearance(true, false).theme).toBe('light');
    expect(decideInitialAppearance(false, true).theme).toBe('light');
    expect(decideInitialAppearance(false, false).theme).toBe('light');
  });
});
