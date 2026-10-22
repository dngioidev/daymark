import { describe, expect, it } from 'vitest';
import { DEFAULT_WIDGET_STYLE, parseWidgetStyle, resolveWidgetColors } from './widgetStyle';
import { contrastRatio } from './color';

describe('widget styles', () => {
  it('fills an empty or missing style with the legacy defaults', () => {
    expect(parseWidgetStyle({})).toEqual(DEFAULT_WIDGET_STYLE);
    expect(parseWidgetStyle(null)).toEqual(DEFAULT_WIDGET_STYLE);
    expect(parseWidgetStyle({}).show).toEqual({ done: false, age: true, quickAdd: true, sections: false });
  });
  it('falls back from unknown choices and invalid colours', () => {
    expect(parseWidgetStyle({ font: 'comic', size: 'huge', background: 'red' })).toMatchObject({ font: 'sans', size: 'm', background: '#1c1917' });
  });
  it('fills nested flags independently and keeps false', () => {
    expect(parseWidgetStyle({ show: { age: false } }).show).toEqual({ done: false, age: false, quickAdd: true, sections: false });
  });
  it('clamps opacity and rejects non-numeric values', () => {
    expect(parseWidgetStyle({ opacity: -1 }).opacity).toBe(0);
    expect(parseWidgetStyle({ opacity: 200 }).opacity).toBe(100);
    expect(parseWidgetStyle({ opacity: '50' }).opacity).toBe(100);
    expect(parseWidgetStyle({ opacity: NaN }).opacity).toBe(100);
  });
  it('uses the resolved app header, text and accent in match-app mode', () => {
    const colors = resolveWidgetColors(parseWidgetStyle({ mode: 'match-app', opacity: 40 }), { headerBg: '#123456', headerText: '#ffffff', accent: '#abcdef' });
    expect(colors).toMatchObject({ bg: '#123456', text: '#ffffff', accent: '#abcdef', bgAlpha: 0.4 });
  });
  it('uses custom colours until app colours arrive', () => {
    expect(resolveWidgetColors(parseWidgetStyle({ mode: 'match-app' }), null).bg).toBe('#1c1917');
  });
  it('chooses dark automatic text on a light background', () => {
    expect(resolveWidgetColors(parseWidgetStyle({ background: '#fafaf9' }), null).text).toBe('#1c1917');
  });
  it('preserves the existing dark palette', () => {
    expect(resolveWidgetColors(DEFAULT_WIDGET_STYLE, null)).toEqual({ bg: '#1c1917', bgAlpha: 1, text: '#f5f5f4', muted: '#d6d3d1', accent: '#f59e0b' });
  });
  it('keeps automatic text and muted labels readable on mid-grey', () => {
    const c = resolveWidgetColors(parseWidgetStyle({ background: '#78716c' }), null);
    expect(contrastRatio(c.text, c.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.muted, c.bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('retains custom text even when contrast is low', () => {
    expect(resolveWidgetColors(parseWidgetStyle({ text: '#1c1917' }), null).text).toBe('#1c1917');
  });
});
