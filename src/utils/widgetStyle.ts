import type { WidgetStyle } from '../types/daymark';
import { autoTextOn, contrastRatio, parseHex } from './color';

export type { WidgetStyle } from '../types/daymark';
export type WidgetAppColors = { headerBg: string; headerText: string; accent: string };

export const DEFAULT_WIDGET_STYLE: WidgetStyle = {
  mode: 'custom', background: '#1c1917', opacity: 100, text: 'auto', accent: '#f59e0b',
  font: 'sans', size: 'm', corners: 'round', density: 'comfy',
  show: { done: false, age: true, quickAdd: true, sections: false },
};

export function parseWidgetStyle(raw: unknown): WidgetStyle {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const show = r.show && typeof r.show === 'object' ? r.show as Record<string, unknown> : {};
  const choice = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? v as T : fallback;
  const color = (v: unknown, fallback: string) => typeof v === 'string' && parseHex(v) ? v.toLowerCase() : fallback;
  const flag = (key: keyof WidgetStyle['show']) => typeof show[key] === 'boolean' ? show[key] as boolean : DEFAULT_WIDGET_STYLE.show[key];
  return {
    mode: choice(r.mode, ['match-app', 'custom'], 'custom'),
    background: color(r.background, '#1c1917'),
    opacity: typeof r.opacity === 'number' && Number.isFinite(r.opacity) ? Math.max(0, Math.min(100, r.opacity)) : 100,
    text: r.text === 'auto' ? 'auto' : color(r.text, 'auto'), accent: color(r.accent, '#f59e0b'),
    font: choice(r.font, ['sans', 'serif', 'mono'], 'sans'), size: choice(r.size, ['s', 'm', 'l', 'xl'], 'm'),
    corners: choice(r.corners, ['square', 'round', 'extra'], 'round'), density: choice(r.density, ['compact', 'comfy'], 'comfy'),
    show: { done: flag('done'), age: flag('age'), quickAdd: flag('quickAdd'), sections: flag('sections') },
  };
}

export function resolveWidgetColors(style: WidgetStyle, app: WidgetAppColors | null): { bg: string; bgAlpha: number; text: string; muted: string; accent: string } {
  const match = style.mode === 'match-app' && app;
  const bg = match ? match.headerBg : style.background;
  const automatic = bg === '#1c1917' ? '#f5f5f4' : autoTextOn(bg);
  const readable = contrastRatio(automatic, bg) >= 4.5 ? automatic : '#000000';
  const text = match ? match.headerText : style.text === 'auto' ? readable : style.text;
  const mutedCandidate = autoTextOn(bg) === '#ffffff' ? '#d6d3d1' : '#44403c';
  const muted = contrastRatio(mutedCandidate, bg) >= 4.5 ? mutedCandidate : readable;
  return { bg, bgAlpha: style.opacity / 100, text, muted, accent: match ? match.accent : style.accent };
}
