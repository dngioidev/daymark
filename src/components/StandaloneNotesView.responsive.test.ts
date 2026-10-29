// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { StandaloneNotesView } from './StandaloneNotesView';
import type { StandaloneNote } from '../types/daymark';

// Rich editing is covered separately; keep navigation, dialogs and graph real.
vi.mock('./notes/RichNoteEditor', () => ({ default: () => React.createElement('div', null, 'Editor') }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const note = (id: string, folder: string): StandaloneNote => ({ id, title: id, folder, content: '', tags: [], createdAt: '2026-10-29', updatedAt: '2026-10-29' });
let root: Root; let host: HTMLDivElement;
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); localStorage.clear(); vi.restoreAllMocks(); });
async function mount(width: number, compact = false, extra: StandaloneNote[] = []) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  host = document.createElement('div'); host.id = 'root'; document.body.append(host); root = createRoot(host);
  const save = vi.fn();
  await act(async () => root.render(React.createElement(StandaloneNotesView, { notes: [note('First', 'Tech/Java'), note('Second', 'Garden'), ...extra], compact, onUpdateNotes: save })));
  return save;
}
const button = (name: string, scope: ParentNode = document) => [...scope.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === name || b.textContent === name)!;
async function click(el: HTMLElement) { expect(el).toBeTruthy(); await act(async () => el.click()); }
const row = (name: string) => document.querySelector<HTMLElement>(`[role=treeitem][data-note-id="${name}"]`)!;

it('puts the same switch first in the graph toolbar and preserves the open note', async () => {
  const save = await mount(1440);
  await click(row('Second'));
  expect(host.querySelector('header[aria-label="Notes view"]')).toBeNull();
  expect(host.querySelector('h1')).toBeNull();
  await act(async () => {
    button('List').focus();
    button('List').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await import('./notes/graph/GraphView');
  });
  const toolbar = host.querySelector('[role=toolbar][aria-label="Graph controls"]')!;
  expect(toolbar?.firstElementChild?.getAttribute('role')).toBe('radiogroup');
  expect(button('Graph').getAttribute('aria-checked')).toBe('true');
  expect(document.activeElement).toBe(button('Graph'));
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
  expect(document.activeElement).toBe(button('List'));
  expect(host.querySelector<HTMLInputElement>('#note-title')?.value).toBe('Second');
  expect(save).not.toHaveBeenCalled();
});

it('strip replaces the whole column and exposes search, creation and eight folders plus overflow', async () => {
  const save = await mount(1440, false, Array.from({ length: 8 }, (_, i) => note(`Extra${i}`, `Other${i}`)));
  await click(button('Minimize folders'));
  expect(host.querySelector('[role=tree]')).toBeNull();
  expect(host.querySelector('[aria-label="Notes list"]')).toBeNull();
  const strip = host.querySelector('[aria-label="Notes shortcuts"]')!;
  expect(strip.querySelectorAll('[data-folder-path]')).toHaveLength(8);
  expect(button('2 more folders', strip)?.textContent).toBe('+2');
  for (const name of ['Search notes', 'New note', 'New folder']) expect(button(name, strip)?.title).toBe(name);
  await click(button('New note', strip));
  expect(save.mock.calls[0][0][0]).toMatchObject({ title: 'Untitled', folder: '', content: '' });
  await click(button('New folder', strip));
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('At the top level');
  await click(button('Close', document.querySelector('[role=dialog]')!));
  await click(button('Search notes', strip));
  expect(document.activeElement?.id).toBe('notes-search');
  await act(async () => {
    button('List').focus(); button('List').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await import('./notes/graph/GraphView');
  });
  await act(async () => button('Graph').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
  expect(document.activeElement).toBe(button('List'));
  await click(button('Minimize folders'));
  await click(button('Open folder Garden'));
  expect(host.querySelector('[data-folder-path="Garden"]')?.getAttribute('aria-current')).toBe('true');
});

it('900px Notes drawer preserves query and expansion, closes on Escape or note open and returns focus', async () => {
  await mount(900);
  expect(host.querySelector('[role=tree]')).toBeNull();
  const opener = button('Notes', host); await act(async () => opener.focus()); await click(opener);
  let dialog = document.querySelector('[role=dialog]')!;
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  const input = dialog.querySelector<HTMLInputElement>('#notes-search')!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { setValue.call(input, 'Second'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role=dialog]')).toBeNull(); expect(document.activeElement).toBe(opener);
  await click(opener); dialog = document.querySelector('[role=dialog]')!;
  expect(dialog.querySelector<HTMLInputElement>('#notes-search')?.value).toBe('Second');
  await click(row('Second'));
  expect(document.querySelector('[role=dialog]')).toBeNull(); expect(document.activeElement).toBe(opener);
  expect(host.querySelector<HTMLInputElement>('#note-title')?.value).toBe('Second');
  await click(opener);
  expect(document.querySelector('[data-folder-path="Garden"]')?.getAttribute('aria-expanded')).toBe('true');
});

it.each([{ width: 390, compact: false }, { width: 900, compact: true }])('phone column keeps its scroll on Back, 44px rows and no graph or drag ($width, $compact)', async ({ width, compact }) => {
  await mount(width, compact);
  const tree = host.querySelector<HTMLElement>('[role=tree]')!;
  expect(host.querySelector('[role=radiogroup]')).toBeNull();
  expect(tree.querySelector('[draggable=true]')).toBeNull();
  expect(tree.querySelector('[aria-selected=true]')).toBeNull();
  expect(tree.querySelector('[data-folder-path="Tech/Java"]')?.getAttribute('aria-expanded')).toBe('true'); // first run reveals the shown note
  expect(row('First').style.height).toBe('44px');
  tree.scrollTop = 176;
  await act(async () => tree.dispatchEvent(new Event('scroll', { bubbles: true })));
  await click(row('Second'));
  expect(host.querySelector('#note-title')).not.toBeNull();
  expect(host.querySelector('[aria-label^="Move to folder:"]')).not.toBeNull();
  await click(button('Back to notes'));
  expect(host.querySelector('[role=tree]')).toBe(tree);
  expect(tree.scrollTop).toBe(176);
});

it('keeps the Notes drawer accessible in an empty narrow-window vault', async () => {
  await mount(900);
  await act(async () => root.render(React.createElement(StandaloneNotesView, { notes: [], onUpdateNotes: vi.fn() })));
  await click(button('Notes', host));
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('No notes yet. Create a note.');
});

it('returns from Graph to the narrow Notes drawer with keyboard focus on List', async () => {
  await mount(900);
  await click(button('Notes', host));
  await act(async () => {
    button('List').focus(); button('List').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await import('./notes/graph/GraphView');
  });
  expect(document.activeElement).toBe(button('Graph'));
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
  expect(document.querySelector('[role=dialog]')).not.toBeNull();
  expect(document.activeElement).toBe(button('List'));
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.activeElement).toBe(button('Notes', host));
});
