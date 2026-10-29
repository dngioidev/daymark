// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { NoteNavigation, type NoteNavigationProps } from './NoteNavigation';
import type { StandaloneNote } from '../../types/daymark';
const note = (id: string, title: string, folder = '', extra = {}): StandaloneNote => ({ id, title, folder, content: 'private body', tags: [], createdAt: '2026-10-29', updatedAt: '2026-10-29', ...extra });
const base = (): NoteNavigationProps => ({ notes: [note('one', 'Java', 'Tech/Java', { pinned: true }), note('two', 'Root')], meta: { folders: [], dismissed: [] }, expanded: new Set(['tech', 'tech/java']), currentFolder: 'Tech', query: '', openNoteId: 'one', onExpandedChange: vi.fn(), onQueryChange: vi.fn(), onOpenNote: vi.fn(), onSelectFolder: vi.fn(), onNewNote: vi.fn(), onNewFolder: vi.fn(), onFolderAction: vi.fn(), dragEnabled: true });
const parse = (props = base()) => { const el = document.createElement('div'); el.innerHTML = renderToStaticMarkup(React.createElement(NoteNavigation, props)); return el; };
let root: Root | undefined; let host: HTMLDivElement;
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; host?.remove(); });
function mount(props = base()) { host = document.createElement('div'); document.body.append(host); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; root = createRoot(host); act(() => root!.render(React.createElement(NoteNavigation, props))); return props; }
function key(el: Element, key: string) { act(() => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))); }
it('orders search, creation and one accessible tree with title-only note rows and pinned copies', () => {
  const el = parse(); const html = el.innerHTML;
  expect(html.indexOf('id="notes-search"')).toBeLessThan(html.indexOf('New note'));
  expect(html.indexOf('New folder')).toBeLessThan(html.indexOf('role="tree"'));
  expect(el.querySelector('[role=treeitem][aria-label="Java, folder, 1 note"]')?.getAttribute('aria-level')).toBe('2');
  expect(el.querySelector('[role=treeitem][aria-expanded=true]')).not.toBeNull();
  expect(el.querySelectorAll('[role=treeitem][aria-selected=true]')).toHaveLength(2);
  expect(el.querySelector('[role=treeitem][aria-label="Java, pinned"]')?.textContent).toBe('Java');
  expect(html).toContain('Pinned'); expect(el.querySelector('[aria-label=Pin]')).not.toBeNull();
  expect(html).not.toContain('private body'); expect(html).toContain('Last edited');
  const rootNote = el.querySelector('[role=treeitem][aria-label=Root]')!;
  expect(rootNote.getAttribute('aria-setsize')).toBe('2'); expect(rootNote.getAttribute('aria-posinset')).toBe('2');
});
it('filters in place, highlights titles, announces the count and keeps the open note dimmed', () => {
  const p = base(); p.query = 'Root'; const el = parse(p);
  expect(el.querySelector('[role=status]')?.textContent).toBe('1 notes match');
  expect(el.querySelector('mark')?.textContent).toBe('Root');
  expect(el.querySelector('[aria-selected=true]')?.className).toContain('opacity-50');
  expect(el.querySelector('[aria-label="Clear search"]')).not.toBeNull();
  expect(parse({ ...p, query: 'private' }).querySelector('[data-note-id=two]')?.textContent).toContain('private');
});
it('uses the model empty states', () => {
  expect(parse({ ...base(), notes: [] }).textContent).toContain('No notes yet. Create a note.');
  expect(parse({ ...base(), query: 'absent' }).textContent).toContain('No notes match “absent”');
});
it('walks with Home/End, arrows and activation, restoring focus after collapse', () => {
  const p = mount(); let rows = host.querySelectorAll<HTMLElement>('[role=treeitem]');
  act(() => rows[0].focus()); key(rows[0], 'End'); expect(document.activeElement?.getAttribute('aria-label')).toBe('Root');
  key(document.activeElement!, 'Home'); expect(document.activeElement?.getAttribute('aria-label')).toBe('Java, pinned');
  key(document.activeElement!, 'ArrowDown'); expect(document.activeElement?.getAttribute('aria-label')).toBe('Tech, folder, 1 note');
  key(document.activeElement!, 'ArrowRight'); expect(document.activeElement?.getAttribute('aria-label')).toBe('Java, folder, 1 note');
  key(document.activeElement!, 'ArrowLeft'); expect(p.onExpandedChange).toHaveBeenLastCalledWith(new Set(['tech']));
  act(() => root!.render(React.createElement(NoteNavigation, { ...p, expanded: new Set(['tech']) })));
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Java, folder, 1 note');
  key(document.activeElement!, 'ArrowLeft'); expect(document.activeElement?.getAttribute('aria-label')).toBe('Tech, folder, 1 note');
  key(document.activeElement!, 'End'); key(document.activeElement!, 'Enter'); expect(p.onOpenNote).toHaveBeenCalledWith('two');
  key(document.activeElement!, 'Home'); key(document.activeElement!, ' '); expect(p.onOpenNote).toHaveBeenCalledWith('one');
  rows = host.querySelectorAll('[role=treeitem]'); expect([...rows].filter(r => r.tabIndex === 0)).toHaveLength(1);
});
it.each([false, true])('only enables drag handlers for desktop dragEnabled=%s', dragEnabled => {
  const el = parse({ ...base(), dragEnabled }); expect(el.querySelectorAll('[draggable=true]').length > 0).toBe(dragEnabled);
  expect(el.textContent).not.toContain('Move to top level');
});
it('shows the top-level drop strip only during a drag and dispatches the destination', () => {
  const onDropNote = vi.fn(); mount({ ...base(), onDropNote });
  const data = new Map<string, string>(); const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) || '' };
  function drag(el: Element, type: string) { const e = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'dataTransfer', { value: dataTransfer }); act(() => el.dispatchEvent(e)); }
  drag(host.querySelector('[data-note-id=two]')!, 'dragstart');
  const strip = host.querySelector('[aria-label="Move to top level"]')!; expect(strip).not.toBeNull(); drag(strip, 'drop');
  expect(onDropNote).toHaveBeenCalledWith('two', ''); expect(host.textContent).not.toContain('Move to top level');
});
it('never drags on compact or touch pointer input', () => {
  expect(parse({ ...base(), compact: true }).querySelector('[draggable=true]')).toBeNull();
  mount(); const row = host.querySelector('[data-note-id=two]')!;
  const e = new Event('pointerdown', { bubbles: true }); Object.defineProperty(e, 'pointerType', { value: 'touch' }); act(() => row.dispatchEvent(e));
  expect(row.getAttribute('draggable')).not.toBe('true');
});
it('keeps keyboard and route opening usable across a 1,000-note window', () => {
  const notes = Array.from({ length: 1000 }, (_, i) => note(String(i), `Note ${i}`));
  const p = { ...base(), notes, openNoteId: '999' }; mount(p);
  const tree = host.querySelector('[role=tree]') as HTMLElement;
  expect(tree.scrollTop).toBeGreaterThan(30000);
  expect(host.querySelectorAll('[role=treeitem]').length).toBeLessThan(50);
  expect(host.querySelector('[data-note-id="999"]')).not.toBeNull();
  const first = host.querySelector('[tabindex="0"]')!; act(() => (first as HTMLElement).focus()); key(first, 'End');
  expect(document.activeElement?.getAttribute('data-note-id')).toBe('999');
  key(document.activeElement!, 'Home'); expect(document.activeElement?.getAttribute('data-note-id')).toBe('0');
  expect(tree.scrollTop).toBe(0);
  act(() => root!.render(React.createElement(NoteNavigation, { ...p, openNoteId: '900' })));
  expect(host.querySelector('[data-note-id="900"]')).not.toBeNull();
  expect(tree.scrollTop).toBeGreaterThan(28000);
});
it('search expansion is temporary even when a filtered folder is activated', () => {
  const p = mount({ ...base(), query: 'Java', expanded: new Set() });
  const folder = host.querySelector('[data-folder-path="Tech/Java"]')!;
  key(folder, 'Enter'); expect(p.onSelectFolder).toHaveBeenCalledWith('Tech/Java');
  expect(p.onExpandedChange).not.toHaveBeenCalled();
});
