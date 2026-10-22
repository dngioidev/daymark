import { describe, expect, it } from 'vitest';
import { autoTextOn, composite, contrastRatio, parseHex, relativeLuminance, toHex } from './color';

describe('colour math', () => {
  it('parses six-digit hex and rejects invalid colours', () => {
    expect(parseHex('#Ff8000')).toEqual([255, 128, 0]);
    expect(parseHex('nope')).toBeNull();
    expect(parseHex('#fff')).toBeNull();
    expect(toHex([255, 128, 0])).toBe('#ff8000');
  });
  it('uses WCAG luminance and contrast', () => {
    expect(relativeLuminance('#ffffff')).toBe(1);
    expect(relativeLuminance('#000000')).toBe(0);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });
  it('chooses the more readable text and composites alpha', () => {
    expect(autoTextOn('#1c1917')).toBe('#ffffff');
    expect(autoTextOn('#fafaf9')).toBe('#1c1917');
    expect(composite('#000000', 0.5, '#ffffff')).toBe('#808080');
    expect(composite('#123456', 0, '#ffffff')).toBe('#ffffff');
    expect(composite('#123456', 1, '#ffffff')).toBe('#123456');
  });
});
