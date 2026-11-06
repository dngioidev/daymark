// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InkRail, type InkRailProps } from './InkRail';
import { HandwrittenNoteView, createHandwrittenNote } from './HandwrittenNoteView';

let host: HTMLDivElement, root: Root;
const props = (): InkRailProps => ({ tool: 'pen', color: '#1c1917', width: 4, side: 'left', onExit: vi.fn(),
  onToolChange: vi.fn(), onColorChange: vi.fn(), onWidthChange: vi.fn(), onEraserModeChange: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(),
  selectionCount: 0, onDelete: vi.fn(), onCopy: vi.fn(), onCut: vi.fn(), onPaste: vi.fn(), onDuplicate: vi.fn(), onRecolor: vi.fn() });
function button(label: string) { const b = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`); expect(b, label).not.toBeNull(); return b!; }
function click(label: string) { act(() => button(label).click()); }
function notebook() {
  const onExitFullScreen = vi.fn();
  act(() => root.render(React.createElement(HandwrittenNoteView, { note: createHandwrittenNote('', 'lined', '2026-11-06T00:00:00.000Z'), pages: [], onUpdatePage: vi.fn(), fullScreen: true, onExitFullScreen })));
  return onExitFullScreen;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
it('rail lists Pen, Highlighter, Eraser, Select, Text, Undo, Redo, Exit in that order', () => {
  act(() => root.render(React.createElement(InkRail, props())));
  const names = ['Pen', 'Highlighter', 'Eraser', 'Select', 'Text', 'Undo', 'Redo', 'Exit full screen'];
  expect([...host.querySelectorAll('button')].map(b => b.getAttribute('aria-label')).filter(label => names.includes(label!))).toEqual(names);
  for (const label of names) expect(button(label).className).toContain('h-11');
});
it('rail on the right when dm.ink.railSide=right', () => {
  localStorage.setItem('dm.ink.railSide', 'right'); notebook();
  expect(host.querySelector('[aria-label="Writing tools"]')!.getAttribute('data-side')).toBe('right');
  expect(host.querySelector('section')!.className).toContain('flex-row-reverse');
});
it('defaults left and moves the rail from its overflow, persisting across mounts', () => {
  notebook(); expect(host.querySelector('[data-side="left"]')).not.toBeNull();
  click('More writing options'); click('Move rail to right');
  expect(localStorage.getItem('dm.ink.railSide')).toBe('right');
  expect(host.querySelector('section')!.className).toContain('flex-row-reverse');
});
it('Exit calls onExitFullScreen', () => { const exit = notebook(); click('Exit full screen'); expect(exit).toHaveBeenCalledOnce(); });
it('selection actions appear only with a selection', () => {
  const p = props(); act(() => root.render(React.createElement(InkRail, p)));
  expect(host.querySelector('[aria-label="Selection actions"]')).toBeNull();
  act(() => root.render(React.createElement(InkRail, { ...p, selectionCount: 2 })));
  for (const label of ['Delete', 'Copy', 'Cut', 'Paste', 'Duplicate']) click(label);
  for (const action of [p.onDelete, p.onCopy, p.onCut, p.onPaste, p.onDuplicate]) expect(action).toHaveBeenCalledOnce();
});
it('shares active tool settings, colors and eraser mode with the toolbar', () => {
  const p = props(); act(() => root.render(React.createElement(InkRail, p)));
  click('Pen'); click('Thick'); expect(p.onWidthChange).toHaveBeenCalledWith(8);
  click('Text'); expect(p.onToolChange).toHaveBeenCalledWith('text');
  act(() => root.render(React.createElement(InkRail, { ...p, tool: 'eraser' })));
  click('Eraser'); click('Erase by stroke'); expect(localStorage.getItem('dm.ink.eraserMode')).toBe('stroke');
});
it('opens settings beside the right rail outside its scrollable column', () => {
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 900, right: 956, top: 20, width: 56, height: 44 } as DOMRect);
  act(() => root.render(React.createElement(InkRail, { ...props(), side: 'right' })));
  click('Pen');
  const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.className).toContain('fixed');
  expect(dialog.style.left).toBe('660px');
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(button('Pen'));
  rect.mockRestore();
});
