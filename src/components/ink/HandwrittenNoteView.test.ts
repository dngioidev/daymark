// @vitest-environment jsdom
import JSZip from 'jszip';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HandwrittenNoteView, canWrite, createHandwrittenNote } from './HandwrittenNoteView';
import type { InkPage } from '../../types/daymark';
import { searchVault } from '../../utils/search';
import { buildNoteIndex } from '../../utils/noteRelated';
import { buildVaultZip } from '../../utils/vaultArchive';
import { DEFAULT_SETTINGS } from '../../utils/defaultData';
import { visibleStrokes } from '../../ink/inkModel';

let root: Root; let host: HTMLDivElement;
const note = () => createHandwrittenNote('Study', 'grid', '2026-11-01T00:00:00Z');
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
function click(label: string) { const button = [...host.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || b.textContent) === label)!; expect(button).toBeDefined(); act(() => button.click()); }
function mount(count = 0) {
  const n = note(); let pages: InkPage[] = Array.from({ length: count }, (_, i) => ({ noteId: n.id, page: i, strokes: [], removed: [], updatedAt: n.updatedAt }));
  const update = vi.fn((page: InkPage) => { pages = [...pages.filter(p => p.page !== page.page), page]; draw(); });
  function draw() { root.render(React.createElement(HandwrittenNoteView, { note: n, pages, onUpdatePage: update })); }
  act(draw); return { update, pages: () => pages };
}
it('starts with a width-scaled read-only page without tools or mutation', () => {
  const { update } = mount();
  expect(host.textContent).toContain('Page 1 of 1');
  expect(host.querySelector('[aria-label="Writing tools"]')).toBeNull();
  expect(host.textContent).not.toContain('Add page');
  expect(host.querySelector<HTMLCanvasElement>('canvas')?.style.width).toBe('100%');
  expect(update).not.toHaveBeenCalled(); expect(canWrite()).toBe(false);
});
it('unlocks only on a pen pointerdown and remembers it for the device', () => {
  mount();
  for (const pointerType of ['touch', 'mouse', 'pen']) {
    const e = new Event('pointerdown', { bubbles: true }); Object.defineProperty(e, 'pointerType', { value: pointerType });
    act(() => host.querySelector('canvas')!.dispatchEvent(e));
    expect(!!host.querySelector('[aria-label="Writing tools"]')).toBe(pointerType === 'pen');
  }
  expect(localStorage.getItem('dm.ink.penSeen')).toBe('1'); expect(canWrite()).toBe(true);
});
it('adds a persistent page and navigates without resetting existing pages', () => {
  localStorage.setItem('dm.ink.penSeen', '1'); const { pages } = mount();
  click('Add page'); expect(host.textContent).toContain('Page 2 of 2');
  expect(pages().map(p => p.page).sort()).toEqual([0, 1]);
  click('Previous page'); expect(host.textContent).toContain('Page 1 of 2');
  click('Next page'); expect(host.textContent).toContain('Page 2 of 2');
});
it('bounds a 50-page notebook to visible page and neighbours', () => {
  localStorage.setItem('dm.ink.penSeen', '1'); mount(50);
  for (let i = 0; i < 25; i++) click('Next page');
  expect(host.textContent).toContain('Page 26 of 50');
  expect(host.querySelectorAll('canvas[aria-label="Handwritten page"]').length).toBeLessThanOrEqual(3);
  expect(host.querySelectorAll('canvas[aria-label="Handwritten page"]').length).toBeGreaterThan(0);
});
it('searches and indexes handwriting by title without the compatibility placeholder', () => {
  const n = { ...note(), title: 'Thermodynamics', tags: ['secret'] };
  expect(searchVault([], [n], 'Thermodynamics')).toMatchObject([{ noteId: n.id, snippet: '' }]);
  expect(searchVault([], [n], 'tablet')).toEqual([]);
  const entry = buildNoteIndex([n]).notes.get(n.id)!;
  expect(entry.hasBody).toBe(false); expect(entry.body).toBe(''); expect(entry.tags.size).toBe(0);
});
it('exports the exact compatibility placeholder in Markdown', async () => {
  const n = note(); const zip = await JSZip.loadAsync(await buildVaultZip([], [n], DEFAULT_SETTINGS, { habits: [], days: [] }));
  const files = Object.values(zip.files).filter(f => f.name.startsWith('Daymark/Notes/') && f.name.endsWith('.md'));
  expect(files).toHaveLength(1);
  expect(await files[0].async('string')).toBe('Handwritten note: open Daymark 1.11 or later on a tablet to view.');
});
it('persists real canvas strokes and routes toolbar undo/redo to the visible page', () => {
  const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(function(this: HTMLCanvasElement) {
    if (!contexts.has(this)) contexts.set(this, { setTransform: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), arc: vi.fn(), stroke: vi.fn() } as unknown as CanvasRenderingContext2D);
    return contexts.get(this)!;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 1414 } as DOMRect);
  localStorage.setItem('dm.ink.penSeen', '1'); localStorage.setItem('dm.ink.eraserMode', 'stroke');
  const { pages } = mount();
  function draw() {
    const canvas = host.querySelector('canvas')!;
    for (const type of ['pointerdown', 'pointerup']) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerType: 'pen', pointerId: 1, isPrimary: true, width: 1, height: 1, clientX: 10, clientY: 10, pressure: 0.5 });
      act(() => canvas.dispatchEvent(event));
    }
  }
  draw(); expect(visibleStrokes(pages()[0])).toHaveLength(1);
  click('Undo'); expect(visibleStrokes(pages()[0])).toHaveLength(0);
  click('Redo'); expect(visibleStrokes(pages()[0])).toHaveLength(1);
  click('Eraser');
  click('Eraser');
  expect(host.querySelector('[aria-label="Erase by stroke"]')!.getAttribute('aria-pressed')).toBe('true');
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  draw(); expect(visibleStrokes(pages()[0])).toHaveLength(0);
});

it('follows App ink store pages and never hands a stale pages prop to the canvas', async () => {
  const { InkStoreContext, createInkStore } = await import('../../ink/inkStore');
  localStorage.setItem('dm.ink.penSeen', '1');
  const n = note();
  const stale: InkPage[] = [{ noteId: n.id, page: 0, strokes: [], removed: [], updatedAt: 'stale' }];
  const store = createInkStore(stale);
  const update = vi.fn((page: InkPage) => { store.upsert(page); });
  const view = () => React.createElement(InkStoreContext.Provider, { value: store }, React.createElement(HandwrittenNoteView, { note: n, pages: stale, onUpdatePage: update }));
  act(() => root.render(view()));
  // Pages reach the store without the parent re-rendering; the view follows them anyway.
  act(() => { store.upsert({ ...stale[0], page: 1, updatedAt: 'newer' }); });
  expect(host.textContent).toContain('Page 1 of 2');
  // A parent re-render with the stale prop must not take precedence over the store.
  act(() => root.render(view()));
  expect(host.textContent).toContain('Page 1 of 2');
  click('Add page');
  expect(host.textContent).toContain('Page 3 of 3');
  expect(update.mock.calls.map(([p]) => p.page)).toEqual([2]);
});

it('keeps page controls in the writing row above the page, with a sticky opaque surface', () => {
  localStorage.setItem('dm.ink.penSeen', '1'); mount(5);
  const toolbar = host.querySelector('[aria-label="Writing tools"]')!;
  for (const label of ['Previous page', 'Next page', 'Add page']) expect(toolbar.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
  expect(toolbar.textContent).toContain('1 / 5');
  expect(toolbar.className).toContain('sticky'); expect(toolbar.className).toContain('bg-stone-50');
  expect(toolbar.parentElement!.className).toContain('overflow-y-auto');
  expect(toolbar.nextElementSibling!.querySelector('canvas')).not.toBeNull();
});
it('keeps read-only page navigation together without writing controls', () => {
  mount(2);
  const toolbar = host.querySelector('[aria-label="Page navigation"]')!; expect(toolbar).not.toBeNull();
  expect(toolbar.querySelector('[aria-label="Previous page"]')).not.toBeNull(); expect(toolbar.querySelector('[aria-label="Next page"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Pen"]')).toBeNull(); expect(host.querySelector('[aria-label="Add page"]')).toBeNull();
});
it('opens and closes settings without rendering the notebook or its canvas', () => {
  localStorage.setItem('dm.ink.penSeen', '1');
  const n = note(); const paper = vi.fn(() => 'grid' as const); Object.defineProperty(n, 'paper', { get: paper });
  act(() => root.render(React.createElement(HandwrittenNoteView, { note: n, pages: [], onUpdatePage: vi.fn() })));
  const reads = paper.mock.calls.length; const canvas = host.querySelector('canvas');
  click('Pen'); expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(paper).toHaveBeenCalledTimes(reads); expect(host.querySelector('canvas')).toBe(canvas);
});
