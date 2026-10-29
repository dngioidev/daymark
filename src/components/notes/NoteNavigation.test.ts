// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { NoteNavigation, type NoteNavigationProps } from './NoteNavigation';
import { ViewSwitch } from './ViewSwitch';
import type { StandaloneNote } from '../../types/daymark';
const note = (id: string, title: string, folder = '', extra = {}): StandaloneNote => ({ id, title, folder, content: 'private body', tags: [], createdAt: '2026-10-29', updatedAt: '2026-10-29', ...extra });
const base = (): NoteNavigationProps => ({ notes: [note('one', 'Java', 'Tech/Java', { pinned: true }), note('two', 'Root')], meta: { folders: [], dismissed: [] }, expanded: new Set(['tech', 'tech/java']), currentFolder: 'Tech', query: '', openNoteId: 'one', onExpandedChange: vi.fn(), onQueryChange: vi.fn(), onOpenNote: vi.fn(), onSelectFolder: vi.fn(), onNewNote: vi.fn(), onNewFolder: vi.fn(), onFolderAction: vi.fn(), dragEnabled: true });
const parse = (props = base()) => { const el = document.createElement('div'); el.innerHTML = renderToStaticMarkup(React.createElement(NoteNavigation, props)); return el; };
let root: Root | undefined; let host: HTMLDivElement;
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; host?.remove(); vi.unstubAllGlobals(); });
function mount(props = base()) { host = document.createElement('div'); document.body.append(host); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; root = createRoot(host); act(() => root!.render(React.createElement(NoteNavigation, props))); return props; }
function key(el: Element, key: string) { act(() => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))); }
it('orders search, creation and one accessible tree with title-only note rows and pinned copies', () => {
  const el = parse(); const html = el.innerHTML;
  expect(html.indexOf('id="notes-search"')).toBeLessThan(html.indexOf('New note'));
  expect(html.indexOf('New folder')).toBeLessThan(html.indexOf('role="tree"'));
  expect(el.querySelector('[role=treeitem][aria-label="Java, folder, 1 note"]')?.getAttribute('aria-level')).toBe('2');
  expect(el.querySelector('[role=treeitem][aria-expanded=true]')).not.toBeNull();
  expect(el.querySelectorAll('[role=treeitem][aria-selected=true]')).toHaveLength(1);
  expect(el.querySelector('[role=treeitem][aria-label="Java, pinned"]')?.textContent).toBe('Java');
  expect(html).toContain('Pinned'); expect(el.querySelector('[aria-label=Pin]')).not.toBeNull();
  expect(html).not.toContain('private body'); expect(html).toContain('Last edited');
  const rootNote = el.querySelector('[role=treeitem][aria-label=Root]')!;
  expect(rootNote.getAttribute('aria-setsize')).toBe('2'); expect(rootNote.getAttribute('aria-posinset')).toBe('2');
});
it('filters in place, highlights titles, announces the count and keeps the open note dimmed', () => {
  const p = base(); p.query = 'Root'; const el = parse(p);
  expect(el.querySelector('[role=status]')?.textContent).toBe('1 note matches');
  expect(el.querySelector('mark')?.textContent).toBe('Root');
  expect(el.querySelector('[aria-selected=true]')?.className).toContain('opacity-70');
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

it.each(['Home', 'ArrowUp', 'End', 'ArrowDown'])('does not steal search focus after a same-row %s move', boundaryKey => {
  const p = mount();
  const rows = host.querySelectorAll<HTMLElement>('[role=treeitem]');
  const row = boundaryKey === 'Home' || boundaryKey === 'ArrowUp' ? rows[0] : rows[rows.length - 1];
  act(() => row.focus()); key(row, boundaryKey);
  const search = host.querySelector<HTMLInputElement>('#notes-search')!;
  act(() => search.focus());
  act(() => root!.render(React.createElement(NoteNavigation, { ...p, query: 'Root' })));
  expect(document.activeElement).toBe(search);
});
it.each(['Shift+F10', 'ContextMenu'])('opens a folder actions menu using %s without traversing children', shortcut => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {});
  const p = mount(); const folder = host.querySelector<HTMLElement>('[data-folder-path="Tech"]')!;
  expect(folder.getAttribute('aria-description')).toBe('Shift+F10 or Menu key opens actions');
  expect(folder.getAttribute('aria-keyshortcuts')).toBe('Shift+F10 ContextMenu');
  act(() => folder.focus());
  // Plain F10 should keep its usual browser meaning.
  key(folder, 'F10'); expect(document.querySelector('[role=menu]')).toBeNull();
  act(() => folder.dispatchEvent(new KeyboardEvent('keydown', { key: shortcut === 'Shift+F10' ? 'F10' : 'ContextMenu', shiftKey: shortcut === 'Shift+F10', bubbles: true, cancelable: true })));
  expect(folder.querySelector('[aria-haspopup=menu]')?.getAttribute('aria-expanded')).toBe('true');
  const rename = [...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(item => item.textContent === 'Rename folder')!;
  expect(rename).toBeDefined(); act(() => rename.click());
  expect(p.onFolderAction).toHaveBeenCalledWith('rename', 'Tech');
});
it.each([false, true])('provides phone-height controls and correctly sized folder actions (compact=%s)', compact => {
  const el = parse({ ...base(), compact, query: 'Java' });
  const controls = [el.querySelector('#notes-search')!, el.querySelector('[aria-label="Clear search"]')!, el.querySelector('[aria-label="New folder"]')!, el.querySelector('[aria-label="Note templates"]')!, [...el.querySelectorAll('button')].find(button => button.textContent?.includes('New note'))!];
  for (const control of controls) {
    expect(control.classList.contains('h-11')).toBe(true);
    if (!compact) expect(control.classList.contains('sm:h-9')).toBe(true);
    else expect(control.classList.contains('sm:h-9')).toBe(false);
  }
  const menu = el.querySelector('[aria-label="Actions for Tech"]')!;
  expect(menu.classList.contains(compact ? 'w-11' : 'w-7')).toBe(true);
  if (compact) {
    expect(menu.classList.contains('h-11')).toBe(true);
    for (const row of el.querySelectorAll<HTMLElement>('[role=treeitem]')) expect(row.style.height).toBe('44px');
  }
});
it('keeps one polite status mounted while its singular and plural text changes', () => {
  const p = mount(); const status = host.querySelector('[role=status]'); expect(status).not.toBeNull();
  expect(status?.textContent).toBe('');
  act(() => root!.render(React.createElement(NoteNavigation, { ...p, query: 'Root' })));
  expect(host.querySelector('[role=status]')).toBe(status); expect(status?.textContent).toBe('1 note matches');
  act(() => root!.render(React.createElement(NoteNavigation, { ...p, query: 'private' })));
  expect(status?.textContent).toBe('2 notes match');
  act(() => root!.render(React.createElement(NoteNavigation, p)));
  expect(host.querySelector('[role=status]')).toBe(status); expect(status?.textContent).toBe('');
});
it('groups pinned items by name and keeps empty-state text outside the tree', () => {
  const el = parse(); const group = el.querySelector('[role=tree] [role=group][aria-label=Pinned]');
  expect(group).not.toBeNull(); expect(group!.querySelector('[aria-label="Java, pinned"]')).not.toBeNull();
  const empty = parse({ ...base(), notes: [] });
  expect(empty.textContent).toContain('No notes yet. Create a note.');
  expect(empty.querySelector('[role=tree]')?.textContent).not.toContain('No notes');
  const search = parse({ ...base(), query: 'absent' });
  expect(search.textContent).toContain('No notes match “absent”');
  expect(search.querySelector('[role=tree]')?.textContent).not.toContain('No notes');
});
it('makes the mounted open note the tree tab stop on entry and after leaving', () => {
  const p = mount();
  expect(host.querySelector('[role=treeitem][tabindex="0"]')?.getAttribute('data-note-id')).toBe('one');
  const other = host.querySelector<HTMLElement>('[data-note-id=two]')!;
  act(() => other.focus());
  expect(other.tabIndex).toBe(0);
  act(() => host.querySelector<HTMLInputElement>('#notes-search')!.focus());
  expect(host.querySelector('[role=treeitem][tabindex="0"]')?.getAttribute('data-note-id')).toBe('one');
  act(() => root!.render(React.createElement(NoteNavigation, { ...p, openNoteId: 'missing' })));
  expect(host.querySelector('[role=treeitem][tabindex="0"]')?.getAttribute('aria-label')).toBe('Java, pinned');
});

it('keeps Clear search 44px wide in explicit compact mode even above the small breakpoint', () => {
  const el = parse({ ...base(), compact: true, query: 'Java' });
  const clear = el.querySelector('[aria-label="Clear search"]')!;
  expect(clear.classList.contains('w-11')).toBe(true);
  expect(clear.classList.contains('sm:w-8')).toBe(false);
});

it.each([false, true])('shares fixed action heights including ViewSwitch (compact=%s)', compact => {
  const el = parse({ ...base(), compact, query: 'Java', viewSwitch: React.createElement(ViewSwitch, { value: 'list', onChange: vi.fn(), compact }) });
  const row = el.querySelector('[data-testid="notes-actions-row"]')!;
  expect(row).not.toBeNull();
  expect(row.classList.contains('items-center')).toBe(true);
  const controls = [...row.querySelectorAll('button'), el.querySelector('[aria-label="Clear search"]')!];
  expect(controls).toHaveLength(6);
  for (const control of controls) {
    expect(control.classList.contains('h-11')).toBe(true);
    expect(control.classList.contains('sm:h-9')).toBe(!compact);
    expect(control.classList.contains('items-center')).toBe(true);
    expect(control.className).not.toMatch(/min-h-|py-/);
    expect(control.parentElement!.classList.contains('items-center')).toBe(true);
  }
});

it.each(['Escape', 'select'])('returns folder menu focus to its treeitem after %s and preserves arrow navigation', closeWith => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {});
  mount(); const folder = host.querySelector<HTMLElement>('[data-folder-path="Tech"]')!;
  act(() => folder.focus());
  act(() => folder.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true })));
  const action = document.querySelector<HTMLButtonElement>('[role=menuitem]')!;
  act(() => action.focus());
  if (closeWith === 'Escape') key(action, 'Escape'); else act(() => action.click());
  expect(document.activeElement).toBe(folder); expect(folder.tabIndex).toBe(0);
  key(folder, 'ArrowDown'); expect(document.activeElement?.getAttribute('data-folder-path')).toBe('Tech/Java');
  key(document.activeElement!, 'ArrowUp'); expect(document.activeElement).toBe(folder);
});
it.each(['Renamed', 'Archive/Tech'])('restores focus after a folder key changes to %s', path => {
  const p = mount(); const folder = host.querySelector<HTMLElement>('[data-folder-path="Tech"]')!;
  act(() => folder.focus());
  const next = { ...p, notes: p.notes.map(n => ({ ...n, folder: n.folder.replace('Tech', path) })), expanded: new Set(path === 'Renamed' ? ['renamed', 'renamed/java'] : ['archive', 'archive/tech', 'archive/tech/java']), currentFolder: path, focusFolder: { path } };
  act(() => root!.render(React.createElement(NoteNavigation, next)));
  expect(document.activeElement?.getAttribute('data-folder-path')).toBe(path);
  expect((document.activeElement as HTMLElement).tabIndex).toBe(0);
});
it.each(['Tech/Removed', 'Gone'])('restores a surviving ancestor or first row if requested folder %s no longer exists', path => {
  const p = mount(); const search = host.querySelector<HTMLInputElement>('#notes-search')!; act(() => search.focus());
  act(() => root!.render(React.createElement(NoteNavigation, { ...p, focusFolder: { path } })));
  expect(document.activeElement?.getAttribute('aria-label')).toBe(path === 'Gone' ? 'Java, pinned' : 'Tech, folder, 1 note');
});

it('selects only the in-tree open note and exposes the pinned copy as current', () => {
  const el = parse();
  expect(el.querySelectorAll('[aria-selected=true]')).toHaveLength(1);
  expect(el.querySelector('[role=group][aria-label=Pinned] [aria-current=true]')?.getAttribute('data-note-id')).toBe('one');
  expect(el.querySelector('[role=group][aria-label=Pinned] [aria-selected]')).toBeNull();
  for (const row of el.querySelectorAll('[data-note-id=one]')) expect(row.getAttribute('aria-description')).toBe(row.getAttribute('title'));
});
it.each(['dragend', 'drop'])('clears the drag strip on window %s after its source row is virtualized away', eventName => {
  mount({ ...base(), notes: Array.from({ length: 1000 }, (_, i) => note(String(i), `Note ${i}`)), openNoteId: undefined });
  const source = host.querySelector('[data-note-id="10"]')!;
  const event = new Event('dragstart', { bubbles: true }); Object.defineProperty(event, 'dataTransfer', { value: { setData: vi.fn(), effectAllowed: '' } });
  act(() => source.dispatchEvent(event)); expect(host.querySelector('[aria-label="Move to top level"]')).not.toBeNull();
  const tree = host.querySelector<HTMLElement>('[role=tree]')!; tree.scrollTop = 30000;
  act(() => tree.dispatchEvent(new Event('scroll', { bubbles: true }))); expect(source.isConnected).toBe(false);
  vi.useFakeTimers();
  try {
    act(() => { window.dispatchEvent(new Event(eventName, { bubbles: true })); });
    // Deferred: the strip's own drop handler must still be mounted for the rest of this event dispatch.
    expect(host.querySelector('[aria-label="Move to top level"]')).not.toBeNull();
    act(() => { vi.runAllTimers(); });
  } finally { vi.useRealTimers(); }
  expect(host.querySelector('[aria-label="Move to top level"]')).toBeNull();
});
it('keeps a deferred keyboard destination when removal of the old focused row emits blur', () => {
  mount({ ...base(), notes: Array.from({ length: 1000 }, (_, i) => note(String(i), `Note ${i}`)), openNoteId: undefined });
  const first = host.querySelector<HTMLElement>('[data-note-id="0"]')!; act(() => first.focus());
  const remove = Node.prototype.removeChild;
  const spy = vi.spyOn(Node.prototype, 'removeChild').mockImplementation(function<T extends Node>(this: Node, child: T): T {
    if (Object.is(child, first)) first.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    return remove.call(this, child) as T;
  });
  try { key(first, 'End'); expect(document.activeElement?.getAttribute('data-note-id')).toBe('999'); }
  finally { spy.mockRestore(); }
});
it('sizes the virtual pinned group to contain its complete rows and keeps compact Clear full width', () => {
  const notes = Array.from({ length: 500 }, (_, i) => note(String(i), `Pinned ${i}`, '', { pinned: true }));
  const el = parse({ ...base(), notes }); const group = el.querySelector<HTMLElement>('[role=group][aria-label=Pinned]')!;
  expect(group.style.height).toBe('16032px'); expect(group.style.position).toBe('relative');
  const compact = parse({ ...base(), compact: true, query: 'Java' }).querySelector('[aria-label="Clear search"]')!;
  expect(compact.classList.contains('w-11')).toBe(true); expect(compact.className).not.toMatch(/sm:w-/);
});

it('acknowledges a consumed folder-focus request so a remount does not replay it', () => {
  const onFolderFocusConsumed = vi.fn(); mount({ ...base(), focusFolder: { path: 'Tech' }, onFolderFocusConsumed });
  expect(onFolderFocusConsumed).toHaveBeenCalledOnce();
  const search = host.querySelector<HTMLInputElement>('#notes-search')!; act(() => search.focus());
  act(() => root!.render(React.createElement(NoteNavigation, { ...base(), onFolderFocusConsumed })));
  expect(document.activeElement).toBe(search); expect(onFolderFocusConsumed).toHaveBeenCalledOnce();
});
it('cancels the deferred global drag cleanup when unmounted', () => {
  vi.useFakeTimers();
  try {
    mount(); const source = host.querySelector('[data-note-id=two]')!;
    const event = new Event('dragstart', { bubbles: true }); Object.defineProperty(event, 'dataTransfer', { value: { setData: vi.fn(), effectAllowed: '' } });
    act(() => source.dispatchEvent(event)); act(() => window.dispatchEvent(new Event('dragend')));
    expect(vi.getTimerCount()).toBe(1);
    act(() => root!.unmount()); root = undefined;
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.clearAllTimers(); vi.useRealTimers(); }
});
