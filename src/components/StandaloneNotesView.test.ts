import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StandaloneNote } from '../types/daymark';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0, effects: [] as (() => unknown)[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof React>(),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next;
    }];
  },
  useEffect: (effect: () => unknown) => hooks.effects.push(effect),
  useMemo: (fn: () => unknown) => fn(),
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
}));
vi.mock('../native/backButton', () => ({ useBackHandler: vi.fn() }));
vi.mock('./MarkdownPreview', () => ({ MarkdownPreview: () => React.createElement('p', null, 'Preview') }));
import { StandaloneNotesView } from './StandaloneNotesView';
import { Menu, type MenuItem } from './ui/Menu';

const note: StandaloneNote = { id: 'one', title: 'Existing', content: '# Hi there\n- [ ] one two', folder: 'Work', tags: [], pinned: false, createdAt: '2026-10-22T00:00:00Z', updatedAt: new Date().toISOString() };
const update = vi.fn();
it('wiki creation uses the current folder and keeps the source note open', () => {
  const tree = render();
  const editor = find(tree, el => el.props.noteId === note.id)!;
  const before = [...hooks.values];
  const create = editor.props.onCreateNote as (title: string) => string;
  expect(create('Linked')).toBeTruthy();
  expect(hooks.values).toEqual(before);
  (editor.props.onChange as (markdown: string) => void)('[[Linked]]');
  expect(update.mock.calls.at(-1)![0]).toEqual([
    expect.objectContaining({ title: 'Linked', folder: 'Work' }),
    expect.objectContaining({ id: note.id, content: '[[Linked]]' }),
  ]);
  expect(update.mock.calls[0][0][0]).toMatchObject({ title: 'Linked', folder: 'Work' });
  expect(find(render(), el => el.props.noteId === note.id)).toBeDefined();
});
it('supplies wiki suggestions most recently updated first, regardless of pinning', () => {
  const older = { ...note, id: 'older', title: 'Older', updatedAt: '2020-01-01', pinned: true };
  const tree = render(false, { notes: [older, note] });
  const editor = find(tree, el => !!el.props.noteId)!;
  expect(editor.props.notes).toEqual([{ id: note.id, title: note.title }, { id: older.id, title: older.title }]);
});
function render(compact = false, extra: Record<string, unknown> = {}) {
  hooks.index = 0;
  hooks.effects = [];
  return StandaloneNotesView({ notes: [note], onUpdateNotes: update, compact, ...extra }) as React.ReactElement;
}
type TestProps = Record<string, unknown> & { onClick: () => void; items: MenuItem[] };
function find(element: React.ReactNode, predicate: (el: React.ReactElement<Record<string, unknown>>) => boolean): React.ReactElement<TestProps> | undefined {
  if (Array.isArray(element)) {
    for (const child of element) {
      const match = find(child, predicate);
      if (match) return match;
    }
    return;
  }
  if (!React.isValidElement<Record<string, unknown>>(element)) return;
  if (predicate(element)) return element as React.ReactElement<TestProps>;
  for (const child of React.Children.toArray(element.props.children as React.ReactNode)) {
    const match = find(child, predicate);
    if (match) return match;
  }
}
beforeEach(() => { hooks.values = []; update.mockClear(); });
afterEach(() => vi.unstubAllGlobals());

it('provides a focus toggle and restores the list with the same button', () => {
  let tree = render();
  const focus = find(tree, (el) => el.props['aria-label'] === 'Focus mode');
  expect(focus).toBeDefined();
  focus!.props.onClick();
  tree = render();
  expect(find(tree, (el) => el.props.id === 'notes-search')).toBeUndefined();
  expect(find(tree, (el) => el.props.noteId === note.id && el.props.markdown === note.content)).toBeDefined();
  find(tree, (el) => el.props['aria-label'] === 'Focus mode')!.props.onClick();
  expect(find(render(), (el) => el.props.id === 'notes-search')).toBeDefined();
});

it('creates a template note with its suggested folder, title and body', () => {
  const tree = render();
  const menu = find(tree, (el) => el.type === Menu && (el.props.items as { label: string }[]).some((item) => item.label === 'Meeting'));
  expect(menu).toBeDefined();
  menu!.props.items.find((item) => item.label === 'Meeting')!.onSelect();
  expect(update.mock.calls[0][0][0]).toMatchObject({ folder: 'Meetings', title: expect.stringContaining('Meeting'), content: expect.stringContaining('## Attendees') });
  expect(update.mock.calls[0][0][1]).toEqual(note);
});

it('returns to the list from focus mode with Back to notes', () => {
  find(render(), (el) => el.props['aria-label'] === 'Focus mode')!.props.onClick();
  find(render(), (el) => el.props['aria-label'] === 'Back to notes')!.props.onClick();
  expect(find(render(), (el) => el.props.id === 'notes-search')).toBeDefined();
});

it('creates Blank in the current folder without changing existing notes', () => {
  const menu = find(render(), (el) => el.type === Menu && (el.props.items as MenuItem[]).some((item) => item.label === 'Blank'));
  menu!.props.items.find((item) => item.label === 'Blank')!.onSelect();
  expect(update.mock.calls[0][0]).toEqual([expect.objectContaining({ title: 'Untitled', folder: 'Work', content: '' }), note]);
});

it('toggles focus on an App signal change, with no local dot shortcut', () => {
  const add = vi.fn();
  vi.stubGlobal('document', { addEventListener: add, removeEventListener: vi.fn() });
  vi.stubGlobal('window', { setInterval: vi.fn(), clearInterval: vi.fn() });
  render(false, { focusToggleSignal: 0 });
  hooks.effects.forEach((effect) => effect());
  render(false, { focusToggleSignal: 1 });
  hooks.effects.forEach((effect) => effect());
  expect(find(render(false, { focusToggleSignal: 1 }), (el) => el.props.id === 'notes-search')).toBeUndefined();
  hooks.effects.forEach((effect) => effect());
  expect(find(render(false, { focusToggleSignal: 1 }), (el) => el.props.id === 'notes-search')).toBeUndefined();
  hooks.effects.forEach((effect) => effect());
  const listener = add.mock.calls.at(-1)![1];
  listener({ key: '.', ctrlKey: true, target: { tagName: 'BUTTON' }, preventDefault: vi.fn() });
  expect(find(render(false, { focusToggleSignal: 1 }), (el) => el.props.id === 'notes-search')).toBeUndefined();
  listener({ key: 'Escape', target: { tagName: 'TEXTAREA' } });
  expect(find(render(false, { focusToggleSignal: 1 }), (el) => el.props.id === 'notes-search')).toBeUndefined();
  listener({ key: 'Escape', target: { tagName: 'BUTTON' } });
  expect(find(render(false, { focusToggleSignal: 1 }), (el) => el.props.id === 'notes-search')).toBeDefined();
});

it('opens a requested note in the compact editor', () => {
  vi.stubGlobal('window', { setInterval: vi.fn(), clearInterval: vi.fn() });
  vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  render(true);
  const other = { ...note, id: 'two', title: 'Chosen', folder: 'Personal' };
  render(true, { notes: [note, other], openNoteId: 'two' });
  hooks.effects.forEach((effect) => effect());
  const tree = render(true, { notes: [note, other], openNoteId: 'two' });
  expect(find(tree, (el) => el.props.id === 'note-title')?.props.value).toBe('Chosen');
});

it('ignores focus signals on compact screens without jumping from the list to the editor', () => {
  vi.stubGlobal('window', { setInterval: vi.fn(), clearInterval: vi.fn() });
  render(true, { focusToggleSignal: 0 });
  hooks.effects.forEach((effect) => effect());
  render(true, { focusToggleSignal: 1 });
  hooks.effects.forEach((effect) => effect());
  expect(find(render(true, { focusToggleSignal: 1 }), (el) => el.props.id === 'notes-search')).toBeDefined();
  expect(find(render(true, { focusToggleSignal: 1 }), (el) => el.props.id === 'note-title')).toBeUndefined();
});

it.each([false, true])('consumes a note-open request once (compact=%s)', (compact) => {
  vi.stubGlobal('window', { setInterval: vi.fn(), clearInterval: vi.fn() });
  vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const consumed = vi.fn();
  render(compact, { openNoteId: note.id, onOpenNoteConsumed: consumed });
  hooks.effects.forEach((effect) => effect());
  expect(consumed).toHaveBeenCalledOnce();
  const tree = render(compact, { onOpenNoteConsumed: consumed });
  expect(find(tree, (el) => el.props.id === 'note-title')?.props.value).toBe('Existing');
  find(tree, (el) => el.props['aria-label'] === 'Back to notes')!.props.onClick();
  render(compact, { onOpenNoteConsumed: consumed });
  hooks.effects.forEach((effect) => effect());
  expect(consumed).toHaveBeenCalledOnce();
  expect(find(render(compact), (el) => el.props.id === 'notes-search')).toBeDefined();
});

it('keeps All and a matching search when creating a blank note', () => {
  const input = find(render(), (el) => el.props.id === 'notes-search')!;
  (input.props.onChange as (e: unknown) => void)({ target: { value: 'untitled' } });
  find(render(), (el) => el.type === 'button' && Array.isArray(el.props.children) && el.props.children.includes(' New note'))!.props.onClick();
  const next = render();
  expect(find(next, (el) => el.props['aria-pressed'] === true && Array.isArray(el.props.children) && el.props.children[0] === 'All (')).toBeDefined();
  expect(find(next, (el) => el.props.id === 'notes-search')?.props.value).toBe('untitled');
});

it('switches a conflicting folder and clears a nonmatching search for templates', () => {
  find(render(), (el) => el.type === 'button' && el.props.children === 'Work')!.props.onClick();
  const input = find(render(), (el) => el.props.id === 'notes-search')!;
  (input.props.onChange as (e: unknown) => void)({ target: { value: 'no-match' } });
  const menu = find(render(), (el) => el.type === Menu && (el.props.items as MenuItem[]).some((item) => item.label === 'Meeting'))!;
  menu.props.items.find((item) => item.label === 'Meeting')!.onSelect();
  expect(find(render(), (el) => el.props.id === 'notes-search')?.props.value).toBe('');
  expect(find(render(false, { notes: update.mock.calls[0][0] }), (el) => el.props.children === 'Meetings' && el.props['aria-pressed'] === true)).toBeDefined();
});

it('keeps compact rich editing bounded with a Markdown toggle', () => {
  const tree = render(true);
  const listNote = find(tree, (el) => el.type === 'button' && el.props['aria-current'] === undefined && typeof el.props.onClick === 'function' && find(el.props.children as React.ReactNode, (child) => child.type === 'span' && child.props.children === 'Existing') !== undefined);
  expect(listNote).toBeDefined();
  listNote!.props.onClick();
  const html = renderToStaticMarkup(render(true));
  expect(html).toContain('flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden');
  expect(html).toContain('flex min-w-0 items-center gap-1');
  expect(html).toContain('min-w-0 w-0 truncate');
  expect(find(render(true), (el) => typeof el.props.onToggleMarkdown === 'function')).toBeDefined();
  expect(html).not.toContain('min-h-[60dvh]');
  expect(html).not.toContain('aria-label="Focus mode"');
});

it('toggles to the existing Markdown textarea and back without changing the note', () => {
  const toggle = () => {
    const tree = render();
    const rich = find(tree, (el) => typeof el.props.onToggleMarkdown === 'function');
    if (rich) (rich.props.onToggleMarkdown as () => void)();
    else find(tree, (el) => el.type === 'button' && el.props['aria-label'] === 'Markdown')!.props.onClick();
  };
  toggle();
  const textarea = find(render(), (el) => el.props.id === 'note-editor-textarea');
  expect(textarea?.props.value).toBe(note.content);
  expect(update).not.toHaveBeenCalled();
  toggle();
  expect(find(render(), (el) => el.props.noteId === note.id && el.props.markdown === note.content)).toBeDefined();
  expect(update).not.toHaveBeenCalled();
});

it('focuses the rich editor through its handle when Enter is pressed in the title', () => {
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback());
  const tree = render();
  const rich = find(tree, (el) => el.props.noteId === note.id)!;
  const focus = vi.fn();
  (rich.props.ref as { current: unknown }).current = { focus };
  const title = find(tree, (el) => el.props.id === 'note-title')!;
  const preventDefault = vi.fn();
  (title.props.onKeyDown as (event: unknown) => void)({ key: 'Enter', preventDefault });
  expect(focus).toHaveBeenCalledOnce();
  expect(preventDefault).toHaveBeenCalledOnce();
});

it('pins controls around a bounded editor and shows a Markdown word count', () => {
  const html = renderToStaticMarkup(render());
  expect(html).toContain('Saved · 4 words · edited');
  expect(html).toContain('h-full');
  expect(html).not.toContain('min-h-[60dvh]');
  expect(html).not.toContain('100dvh-3.5rem');
});
it('forwards the app editor ref to the active rich editor for cleanup', () => {
  const shared = { current: null };
  const editor = find(render(false, { richEditorHandleRef: shared }), element => element.props.noteId === note.id)!;
  expect(editor.props.ref).toBe(shared);
});
