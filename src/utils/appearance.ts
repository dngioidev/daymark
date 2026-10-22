import type { AppearanceSettings, ResolvedAppearance } from '../types/daymark';
import { DEFAULT_APPEARANCE } from './defaultData';
import { autoTextOn, composite, contrastRatio, parseHex, toHex } from './color';

export type { ResolvedAppearance } from '../types/daymark';
export const THEME_MIRROR_KEY = 'daymark_theme';

export function resolveAppearance(a: AppearanceSettings, photo: { luminance: number } | null): ResolvedAppearance {
  const colors = a[a.theme];
  const page = a.theme === 'light' ? '#fafaf9' : '#0c0a09';
  const overlay = a.theme === 'light' ? '#ffffff' : '#000000';
  let dim = a.dim;
  // Photo metadata is linear relative luminance; encode its grey into sRGB first.
  const luminance = Math.max(0, Math.min(1, photo?.luminance ?? 0));
  const channel = 255 * (luminance <= 0.0031308 ? 12.92 * luminance : 1.055 * luminance ** (1 / 2.4) - 0.055);
  const grey = toHex([channel, channel, channel]);
  let backdrop = photo ? composite(overlay, dim / 100, grey) : page;
  if (photo && colors.pageText === 'auto') {
    while (contrastRatio(autoTextOn(backdrop), backdrop) < 4.5 && dim < 90) {
      dim = Math.min(90, dim + 5);
      backdrop = composite(overlay, dim / 100, grey);
    }
  }
  const opacity = colors.headerOpacity / 100;
  const headerBgOpaque = composite(colors.headerBg, opacity, backdrop);
  const rgb = parseHex(colors.headerBg)!;
  const headerBg = opacity === 1 ? colors.headerBg : `rgb(${rgb.join(' ')} / ${opacity})`;
  const autoHeader = autoTextOn(headerBgOpaque);
  // A narrow mid-grey band fails with both white and stone; black closes that gap.
  const headerText = colors.headerText === 'auto'
    ? (contrastRatio(autoHeader, headerBgOpaque) >= 4.5 ? autoHeader : '#000000') : colors.headerText;
  const pageText = colors.pageText === 'auto' ? autoTextOn(backdrop) : colors.pageText;
  const accent = colors.accent === 'auto' ? (a.theme === 'light' ? '#b45309' : '#f59e0b') : colors.accent;
  const autoAccentText = autoTextOn(accent);
  const accentText = contrastRatio(autoAccentText, accent) >= 4.5 ? autoAccentText : '#000000';
  const warnings: ResolvedAppearance['warnings'] = [];
  const check = (field: 'headerText' | 'pageText' | 'accent', fg: string, bg: string) => {
    const ratio = contrastRatio(fg, bg);
    if (colors[field] !== 'auto' && ratio < 4.5) warnings.push({ field, ratio });
  };
  check('headerText', headerText, headerBgOpaque);
  check('pageText', pageText, backdrop);
  // Accent controls sit on cards, whose theme surface stays mostly opaque.
  check('accent', accent, page);
  return {
    theme: a.theme, rootFontPx: { s: 15, m: 16, l: 17.5 }[a.textSize] as ResolvedAppearance['rootFontPx'],
    headerBg, headerBgOpaque, headerText, pageText, accent, accentText,
    dim, blur: a.blur, warnings,
  };
}

export function appearanceVars(r: ResolvedAppearance): Record<string, string> {
  return {
    '--dm-header-bg': r.headerBg, '--dm-header-fg': r.headerText,
    '--dm-page-fg': r.pageText, '--dm-accent': r.accent, '--dm-accent-fg': r.accentText,
    '--dm-dim': String(r.dim / 100), '--dm-blur': `${r.blur}px`,
  };
}

export function decideInitialAppearance(hasExistingData: boolean, systemPrefersDark: boolean): AppearanceSettings {
  return {
    ...DEFAULT_APPEARANCE, theme: hasExistingData && systemPrefersDark ? 'dark' : 'light',
    light: { ...DEFAULT_APPEARANCE.light }, dark: { ...DEFAULT_APPEARANCE.dark },
  };
}
