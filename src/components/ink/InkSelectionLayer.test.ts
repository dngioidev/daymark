// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { InkSelectionLayer } from './InkSelectionLayer';
import { PEN_COLORS } from '../../ink/inkColors';

it('offers compact icon actions and pen swatches, keeping the bar inside the page', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const onRecolor = vi.fn();
  const props = { bounds: { minX: 950, maxX: 990, minY: 1350, maxY: 1400 }, loop: [], hasClip: false, scale: 0.5,
    onDelete: vi.fn(), onCopy: vi.fn(), onCut: vi.fn(), onPaste: vi.fn(), onDuplicate: vi.fn(), onRecolor };
  try {
    act(() => root.render(React.createElement(InkSelectionLayer, props)));
    const bar = host.querySelector<HTMLElement>('[role=toolbar]')!;
    for (const name of ['Delete', 'Copy', 'Cut', 'Duplicate']) {
      const button = bar.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!;
      expect(button.title).toBe(name); expect(button.querySelector('svg')).not.toBeNull();
      expect(button.textContent).toBe(''); expect(button.style.width).toBe('44px'); expect(button.style.height).toBe('44px');
    }
    expect(bar.className).toContain('rounded-xl'); expect(bar.className).toContain('shadow-lg');
    expect(bar.style.bottom).not.toBe(''); expect(bar.style.left).toBe('256px');
    expect(bar.querySelector('[aria-label="Paste"]')).toBeNull(); expect(bar.querySelector('input')).toBeNull();
    act(() => bar.querySelector<HTMLButtonElement>('[aria-label="Recolor selection"]')!.click());
    for (const color of PEN_COLORS) expect(bar.querySelector(`[aria-label="Recolor ${color}"]`)).not.toBeNull();
    act(() => bar.querySelector<HTMLButtonElement>(`[aria-label="Recolor ${PEN_COLORS[1]}"]`)!.click());
    expect(onRecolor).toHaveBeenCalledWith(PEN_COLORS[1]);
    act(() => root.render(React.createElement(InkSelectionLayer, { ...props, hasClip: true, bounds: { minX: 10, maxX: 100, minY: 10, maxY: 100 } })));
    expect(bar.querySelector('[aria-label="Paste"]')).not.toBeNull(); expect(bar.style.top).not.toBe(''); expect(bar.style.bottom).toBe('');
  } finally { act(() => root.unmount()); host.remove(); }
});
