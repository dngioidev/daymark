// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { InkToolbar, readEraserMode } from './InkToolbar';
import { HIGHLIGHTER_COLORS, PEN_COLORS } from '../../ink/inkColors';

it('offers exact palettes, sizes and remembers device eraser mode', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  expect(readEraserMode()).toBe('area');
  const host = document.createElement('div'); const root = createRoot(host);
  const onEraserModeChange = vi.fn(), onWidthChange = vi.fn();
  const props = { tool: 'pen' as const, color: PEN_COLORS[0], width: 4, onToolChange: vi.fn(), onColorChange: vi.fn(), onWidthChange, onEraserModeChange, onUndo: vi.fn(), onRedo: vi.fn() };
  try {
    act(() => root.render(React.createElement(InkToolbar, props)));
    expect([...host.querySelectorAll('[aria-label^="Colour"]')].map(b => b.getAttribute('aria-label'))).toEqual(PEN_COLORS.map(c => `Colour ${c}`));
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'Fine')!.click());
    expect(onWidthChange).toHaveBeenCalledWith(2);
    act(() => root.render(React.createElement(InkToolbar, { ...props, tool: 'highlighter' })));
    expect([...host.querySelectorAll('[aria-label^="Colour"]')].map(b => b.getAttribute('aria-label'))).toEqual(HIGHLIGHTER_COLORS.map(c => `Colour ${c}`));
    act(() => root.render(React.createElement(InkToolbar, { ...props, tool: 'eraser' })));
    const select = host.querySelector('select')!;
    expect(select.value).toBe('area');
    act(() => { select.value = 'stroke'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(onEraserModeChange).toHaveBeenCalledWith('stroke');
    expect(readEraserMode()).toBe('stroke');
    expect(localStorage.getItem('dm.ink.eraserMode')).toBe('stroke');
  } finally { act(() => root.unmount()); localStorage.clear(); }
});
