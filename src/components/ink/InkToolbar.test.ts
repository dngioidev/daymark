// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InkToolbar, readEraserMode } from './InkToolbar';
import { HIGHLIGHTER_COLORS, PEN_COLORS } from '../../ink/inkColors';

let host: HTMLDivElement, root: Root;
const props = () => ({ tool: 'pen' as const, color: PEN_COLORS[0], width: 4, onToolChange: vi.fn(), onColorChange: vi.fn(), onWidthChange: vi.fn(), onEraserModeChange: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn() });
it('offers clipboard Paste without a selection', () => {
  const onPaste = vi.fn();
  act(() => root.render(React.createElement(InkToolbar, { ...props(), hasClip: true, onPaste })));
  click('Paste'); expect(onPaste).toHaveBeenCalledOnce();
  act(() => root.render(React.createElement(InkToolbar, { ...props(), hasClip: false, onPaste })));
  expect(host.querySelector('[aria-label="Paste"]')).toBeNull();
});
function button(label: string, scope: ParentNode = host) { const b = scope.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`); expect(b).not.toBeNull(); return b!; }
function click(label: string, scope: ParentNode = host) { act(() => button(label, scope).click()); }
function dialog() { const d = host.querySelector<HTMLElement>('[role="dialog"]'); expect(d).not.toBeNull(); return d!; }
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); localStorage.clear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); localStorage.clear(); });

it('offers icon tools in one scrollable non-wrapping row with quick palettes and selected states', () => {
  const p = props(); act(() => root.render(React.createElement(InkToolbar, p)));
  for (const label of ['Pen', 'Highlighter', 'Eraser', 'Undo', 'Redo']) {
    expect(button(label).querySelector('svg')).not.toBeNull();
    expect(button(label).className).toContain('h-10');
  }
  expect(button('Pen').getAttribute('aria-pressed')).toBe('true');
  expect(host.querySelector('[role="toolbar"]')!.className).not.toContain('flex-wrap');
  expect(host.querySelector('.overflow-x-auto')).not.toBeNull();
  expect([...host.querySelectorAll('[aria-label^="Colour"]')].map(b => b.getAttribute('aria-label'))).toEqual(PEN_COLORS.map(c => `Colour ${c}`));
  click(`Colour ${PEN_COLORS[1]}`); expect(p.onColorChange).toHaveBeenCalledWith(PEN_COLORS[1]);
  click('Highlighter'); expect(p.onToolChange).toHaveBeenCalledWith('highlighter'); expect(host.querySelector('[role="dialog"]')).toBeNull();
  act(() => root.render(React.createElement(InkToolbar, { ...p, tool: 'highlighter' })));
  expect([...host.querySelectorAll('[aria-label^="Colour"]')].map(b => b.getAttribute('aria-label'))).toEqual(HIGHLIGHTER_COLORS.map(c => `Colour ${c}`));
  act(() => root.render(React.createElement(InkToolbar, { ...p, tool: 'eraser' })));
  expect(host.querySelector('[aria-label^="Colour"]')).toBeNull();
});
it.each([['pen', 'Pen', 'Fine', 2], ['highlighter', 'Highlighter', 'Thick', 36]] as const)('opens active %s settings, selects line preview sizes and colours, closes and restores focus', (tool, label, size, width) => {
  const p = { ...props(), tool }; act(() => root.render(React.createElement(InkToolbar, p)));
  click(label); expect(dialog().getAttribute('aria-label')).toBe(`${label} settings`);
  expect(dialog().contains(document.activeElement)).toBe(true);
  expect(button(size, dialog()).querySelector('[aria-hidden="true"]')).not.toBeNull();
  click(size, dialog()); expect(p.onWidthChange).toHaveBeenCalledWith(width);
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(button(label));
  click(label); const color = tool === 'pen' ? PEN_COLORS[2] : HIGHLIGHTER_COLORS[2];
  click(`Colour ${color}`, dialog()); expect(p.onColorChange).toHaveBeenCalledWith(color);
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(button(label));
});
it('dismisses settings on Escape and outside pointerdown and returns focus', () => {
  act(() => root.render(React.createElement(InkToolbar, props())));
  click('Pen'); act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(button('Pen'));
  click('Pen'); dialog(); act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(button('Pen'));
});
it('persists eraser mode and reapplies the stored mode when selecting eraser', () => {
  const p = props(); expect(readEraserMode()).toBe('area');
  act(() => root.render(React.createElement(InkToolbar, { ...p, tool: 'eraser' })));
  click('Eraser'); click('Erase by stroke', dialog());
  expect(p.onEraserModeChange).toHaveBeenCalledWith('stroke'); expect(localStorage.getItem('dm.ink.eraserMode')).toBe('stroke');
  expect(readEraserMode()).toBe('stroke'); expect(host.querySelector('[role="dialog"]')).toBeNull();
  act(() => root.render(React.createElement(InkToolbar, p))); click('Eraser'); expect(p.onEraserModeChange).toHaveBeenLastCalledWith('stroke');
  act(() => root.render(React.createElement(InkToolbar, { ...p, tool: 'eraser' })));
  click('Eraser'); expect(button('Erase by stroke', dialog()).getAttribute('aria-pressed')).toBe('true');
  click('Erase by area', dialog()); expect(readEraserMode()).toBe('area'); expect(p.onEraserModeChange).toHaveBeenLastCalledWith('area');
});

it('scrolls tools and history before quick colours while keeping page controls outside the scroller', () => {
  const pageControls = React.createElement('div', { 'data-page-controls': true }, React.createElement('button', { 'aria-label': 'Add page' }));
  act(() => root.render(React.createElement(InkToolbar, { ...props(), pageControls })));
  const scroller = host.querySelector('.overflow-x-auto')!;
  expect(scroller.contains(button('Add page'))).toBe(false);
  expect(scroller.nextElementSibling).toBe(host.querySelector('[data-page-controls]'));
  expect(scroller.classList.contains('min-w-0')).toBe(true);
  expect(scroller.classList.contains('flex-1')).toBe(true);
  expect([...scroller.querySelectorAll('button')].map(b => b.getAttribute('aria-label'))).toEqual([
    'Pen', 'Highlighter', 'Eraser', 'Undo', 'Redo',
    'Colour #1c1917', 'Colour #1d4ed8', 'Colour #b91c1c', 'Colour #15803d',
  ]);
  click('Pen');
  expect(scroller.contains(dialog())).toBe(false);
});
