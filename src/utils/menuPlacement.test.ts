import { describe, expect, it } from 'vitest';
import { placeMenu } from './menuPlacement';

describe('placeMenu', () => {
  it('places below when it fits', () => {
    expect(placeMenu({ top: 40, bottom: 80, left: 100, right: 140 }, { width: 208, height: 300 }, { width: 1440, height: 900 }, 'left'))
      .toEqual({ top: 84, left: 100, maxHeight: 808, placement: 'below' });
  });

  it('flips above near the bottom', () => {
    const result = placeMenu({ top: 840, bottom: 880, left: 100, right: 140 }, { width: 208, height: 300 }, { width: 1440, height: 900 }, 'left');
    expect(result.placement).toBe('above');
    expect(result.top).toBe(840 - 300 - 4);
  });

  it('clamps maxHeight when neither side fits', () => {
    const result = placeMenu({ top: 180, bottom: 220, left: 100, right: 140 }, { width: 208, height: 600 }, { width: 1440, height: 400 }, 'left');
    expect(result.maxHeight).toBe(168);
    expect(result.maxHeight).toBeLessThanOrEqual(392 - 4);
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(392);
  });

  it('clamps horizontally', () => {
    const anchor = { top: 40, bottom: 80, left: 20, right: 60 };
    expect(placeMenu(anchor, { width: 208, height: 100 }, { width: 400, height: 900 }, 'right').left).toBe(8);
    expect(placeMenu({ ...anchor, left: 390, right: 400 }, { width: 208, height: 100 }, { width: 400, height: 900 }, 'left').left).toBe(184);
  });
});
