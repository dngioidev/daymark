import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StandaloneNote } from '../types/daymark';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0, effects: [] as (() => unknown)[] }));
const feedback = vi.hoisted(() => ({ confirm: vi.fn(), toast: vi.fn() }));
vi.mock('./ui/feedback', () => ({ confirmDialog: feedback.confirm, showToast: feedback.toast }));
vi.mock('react', async (original) => ({
  ...await original<typeof React>(),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial;
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
import { NoteFolderTree } from './notes/NoteFolderTree';
import { NoteNavigation } from './notes/NoteNavigation';
import { FolderPicker } from './notes/FolderPicker';
import { FolderDialogs } from './notes/FolderDialogs';
import { RelatedPanel } from './notes/RelatedPanel';

const note: StandaloneNote = { id: 'one', title: 'Existing', content: '# Hi there\n- [ ] one two', folder: 'Work', tags: [], pinned: false, createdAt: '2026-10-22T00:00:00Z', updatedAt: new Date().toISOString() };
const update = vi.fn();
it('explains a loading editor and missing targets instead of silently ignoring Link', () => {
  const related = find(render(), el => el.type === RelatedPanel)!;
  (related.props.onLink as (id: string) => void)('missing');
  expect(feedback.toast).toHaveBeenLastCalledWith('That note no longer exists. Suggestions are refreshing.', { tone: 'info' });
  const target = { ...note, id: 'target', title: 'Target' };
  const loading = find(render(false, { notes: [note, target], richEditorHandleRef: { current: null } }), el => el.type === RelatedPanel)!;
  (loading.props.onLink as (id: string) => void)('target');
  expect(feedback.toast).toHaveBeenLastCalledWith('The editor is still loading, try again', { tone: 'info' });
  expect(update).not.toHaveBeenCalled();
});
it('Markdown Link reads the latest source even before the parent rerenders', () => {
  const target = { ...note, id: 'target', title: 'Target' };
  const extra = { notes: [note, target] };
  (find(render(false, extra), el => !!el.props.noteId)!.props.onToggleMarkdown as () => void)();
  const tree = render(false, extra);
  (find(tree, el => el.type === 'textarea')!.props.onChange as (event: unknown) => void)({ target: { value: 'Latest unsaved typing' } });
  (find(tree, el => el.type === RelatedPanel)!.props.onLink as (id: string) => void)('target');
  expect(update.mock.calls.at(-1)![0].find((n: StandaloneNote) => n.id === note.id).content).toBe('Latest unsaved typing\n\n## Related\n- [[Target]]\n');
});
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
beforeEach(() => { hooks.values = []; update.mockClear(); feedback.confirm.mockReset().mockResolvedValue(true); feedback.toast.mockClear(); });
afterEach(() => vi.unstubAllGlobals());

it('provides a focus toggle and restores the list with the same button', () => {
  let tree = render();
  const focus = find(tree, (el) => el.props['aria-label'] === 'Focus mode');
  expect(focus).toBeDefined();
  focus!.props.onClick();
  tree = render();
  expect(find(tree, (el) => el.type === NoteNavigation)).toBeUndefined();
  expect(find(tree, (el) => el.props.noteId === note.id && el.props.markdown === note.content)).toBeDefined();
  find(tree, (el) => el.props['aria-label'] === 'Focus mode')!.props.onClick();
  expect(find(render(), (el) => el.type === NoteNavigation)).toBeDefined();
});

it('creates a template note with its suggested folder, title and body', () => {
  const tree = render();
  const menu = find(tree, (el) => el.type === NoteNavigation);
  expect(menu).toBeDefined();
  (menu!.props.templateItems as MenuItem[]).find((item) => item.label === 'Meeting')!.onSelect();
  expect(update.mock.calls[0][0][0]).toMatchObject({ folder: 'Meetings', title: expect.stringContaining('Meeting'), content: expect.stringContaining('## Attendees') });
  expect(update.mock.calls[0][0][1]).toEqual(note);
});

it('returns to the list from focus mode with Back to notes', () => {
  find(render(), (el) => el.props['aria-label'] === 'Focus mode')!.props.onClick();
  find(render(), (el) => el.props['aria-label'] === 'Back to notes')!.props.onClick();
  expect(find(render(), (el) => el.type === NoteNavigation)).toBeDefined();
});

it('creates Blank in the open note folder without changing existing notes', () => {
  const menu = find(render(), (el) => el.type === NoteNavigation);
  (menu!.props.templateItems as MenuItem[]).find((item) => item.label === 'Blank')!.onSelect();
  expect(update.mock.calls[0][0]).toEqual([expect.objectContaining({ title: 'Untitled', folder: 'Work', content: '' }), note]);
});

it.each(['Archive/2019', '', 'Work'])('creates a new note in the selected destination (%s)', selected => {
  const extra = { notes: [{ ...note, folder: 'Archive/2019' }, { ...note, id: 'work' }] };
  (find(render(false, extra), el => el.type === NoteNavigation)!.props.onSelectFolder as (path: string) => void)(selected);
  (find(render(false, extra), el => el.type === NoteNavigation)!.props.onNewNote as () => void)();
  expect(update.mock.calls[0][0][0]).toMatchObject({ title: 'Untitled', folder: selected });
});

it('toggles focus on an App signal change, with no local dot shortcut', () => {
  const add = vi.fn();
  vi.stubGlobal('document', { addEventListener: add, removeEventListener: vi.fn() });
  vi.stubGlobal('window', { setInterval: vi.fn(), clearInterval: vi.fn() });
  render(false, { focusToggleSignal: 0 });
  hooks.effects.forEach((effect) => effect());
  render(false, { focusToggleSignal: 1 });
  hooks.effects.forEach((effect) => effect());
  expect(find(render(false, { focusToggleSignal: 1 }), (el) => el.type === NoteNavigation)).toBeUndefined();
  hooks.effects.forEach((effect) => effect());
  expect(find(render(false, { focusToggleSignal: 1 }), (el) => el.type === NoteNavigation)).toBeUndefined();
  hooks.effects.forEach((effect) => effect());
  const listener = add.mock.calls.at(-1)![1];
  listener({ key: '.', ctrlKey: true, target: { tagName: 'BUTTON' }, preventDefault: vi.fn() });
  expect(find(render(false, { focusToggleSignal: 1 }), (el) => el.type === NoteNavigation)).toBeUndefined();
  listener({ key: 'Escape', target: { tagName: 'TEXTAREA' } });
  expect(find(render(false, { focusToggleSignal: 1 }), (el) => el.type === NoteNavigation)).toBeUndefined();
  listener({ key: 'Escape', target: { tagName: 'BUTTON' } });
  expect(find(render(false, { focusToggleSignal: 1 }), (el) => el.type === NoteNavigation)).toBeDefined();
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
  expect(find(render(true, { focusToggleSignal: 1 }), (el) => el.type === NoteNavigation)).toBeDefined();
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
  expect(find(render(compact), (el) => el.type === NoteNavigation)).toBeDefined();
});

it('keeps the current folder and a matching search when creating a blank note', () => {
  const input = find(render(), (el) => el.type === NoteNavigation)!;
  (input.props.onQueryChange as (q: string) => void)('untitled');
  (find(render(), el => el.type === NoteNavigation)!.props.onNewNote as () => void)();
  const next = render();
  expect(find(next, (el) => el.type === NoteNavigation)?.props.currentFolder).toBe('Work');
  expect(find(next, (el) => el.type === NoteNavigation)?.props.query).toBe('untitled');
});

it('uses the template folder and preserves search with the open note reachable', () => {
  (find(render(), (el) => el.type === NoteNavigation)!.props.onSelectFolder as (path: string) => void)('Work');
  const input = find(render(), (el) => el.type === NoteNavigation)!;
  (input.props.onQueryChange as (q: string) => void)('no-match');
  const menu = find(render(), (el) => el.type === NoteNavigation)!;
  (menu.props.templateItems as MenuItem[]).find((item) => item.label === 'Meeting')!.onSelect();
  expect(find(render(), (el) => el.type === NoteNavigation)?.props.query).toBe('no-match');
  expect(find(render(false, { notes: update.mock.calls[0][0] }), (el) => el.type === NoteNavigation)?.props.currentFolder).toBe('Meetings');
});

it('keeps compact rich editing bounded with a Markdown toggle', () => {
  const tree = render(true);
  (find(tree, el => el.type === NoteNavigation)!.props.onOpenNote as (id: string) => void)(note.id);
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

it('cleanup changes the Markdown textarea key while preserving note content', () => {
  const rich = find(render(), element => typeof element.props.onToggleMarkdown === 'function')!;
  (rich.props.onToggleMarkdown as () => void)();
  const before = find(render(false, { pictureCleanupSignal: 0 }), element => element.type === 'textarea')!;
  const after = find(render(false, { pictureCleanupSignal: 1 }), element => element.type === 'textarea')!;
  expect(before).toBeDefined(); expect(after).toBeDefined();
  expect(before.key).not.toBe(after.key); expect(after.props.value).toBe(note.content);
});

it('folder selection sets the creation destination without filtering or changing the editor', () => {
  const child = { ...note, id: 'child', title: 'Child', folder: 'Tech/Java' };
  const extra = { notes: [note, child] };
  (find(render(false, extra), el => el.type === NoteNavigation)!.props.onSelectFolder as (path: string) => void)('Tech');
  const next = render(false, extra);
  expect(find(next, el => el.type === NoteNavigation)?.props.currentFolder).toBe('Tech');
  expect(find(next, el => el.type === NoteNavigation)?.props.notes).toEqual([note, child]);
  expect(find(next, el => el.props.id === 'note-title')?.props.value).toBe('Existing');
  expect(find(next, el => el.type === FolderPicker)).toBeDefined();
});

it('creates an empty folder through metadata without an overview note', async () => {
  const onUpdateNoteMeta = vi.fn();
  const extra = { noteMeta: { folders: [], dismissed: [] }, onUpdateNoteMeta };
  (find(render(false, extra), el => el.type === NoteNavigation)!.props.onNewFolder as () => void)();
  const dialog = find(render(false, extra), el => el.type === FolderDialogs)!;
  await (dialog.props.onSubmit as (name: string) => Promise<void>)('Empty');
  expect(onUpdateNoteMeta).toHaveBeenCalledWith(expect.objectContaining({ folders: [expect.objectContaining({ path: 'Work/Empty' })] }));
  expect(update).toHaveBeenCalledOnce();
  expect(update).toHaveBeenCalledWith([note]);
});

it('keeps the moved note open after opening it from the tree', () => {
  const child = { ...note, id: 'child', title: 'Child', folder: 'Tech/Java' };
  const extra = { notes: [note, child] };
  (find(render(false, extra), el => el.type === NoteNavigation)!.props.onOpenNote as (id: string) => void)('child');
  (find(render(false, extra), el => el.type === FolderPicker)!.props.onChange as (path: string) => void)('Work');
  expect(find(render(false, { notes: update.mock.calls.at(-1)![0] }), el => el.props.id === 'note-title')?.props.value).toBe('Child');
});

it('keeps editing the active note when an edit no longer matches search', () => {
  (find(render(), el => el.type === NoteNavigation)!.props.onQueryChange as (q: string) => void)('Existing');
  (find(render(), el => el.props.id === 'note-title')!.props.onChange as (event: unknown) => void)({ target: { value: 'Renamed' } });
  expect(find(render(false, { notes: update.mock.calls.at(-1)![0] }), el => el.props.id === 'note-title')?.props.value).toBe('Renamed');
});

it('retains the source folder when moving its last note', () => {
  const onUpdateNoteMeta = vi.fn();
  const extra = { noteMeta: { folders: [], dismissed: [] }, onUpdateNoteMeta };
  (find(render(false, extra), el => el.type === FolderPicker)!.props.onChange as (path: string) => void)('Tech');
  expect(onUpdateNoteMeta).toHaveBeenCalledWith(expect.objectContaining({ folders: [expect.objectContaining({ path: 'Work' })] }));
});

it('keeps Back to notes reachable throughout the drawer breakpoint', () => {
  vi.stubGlobal('window', { innerWidth: 1050 });
  const back = find(render(), el => el.props['aria-label'] === 'Back to notes')!;
  expect(back.props.className).not.toContain('lg:hidden');
});

it('treats moving a folder to its current parent as a quiet no-op', () => {
  const tree = find(render(), el => el.type === NoteNavigation)!;
  (tree.props.onDropFolder as (path: string, parent: string) => void)('Work', '');
  expect(update).not.toHaveBeenCalled();
  expect(feedback.toast).not.toHaveBeenCalled();
});
it('confirms collision counts and cancels a merge without changing notes', async () => {
  const other = { ...note, id: 'other', folder: 'Personal' };
  const extra = { notes: [note, other] };
  feedback.confirm.mockResolvedValueOnce(false);
  (find(render(false, extra), el => el.type === NoteNavigation)!.props.onFolderAction as (action: string, path: string) => void)('rename', 'Work');
  await (find(render(false, extra), el => el.type === FolderDialogs)!.props.onSubmit as (value: string) => Promise<void>)('Personal');
  expect(feedback.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Merge folders?', message: expect.stringMatching(/2 notes.*Personal/) }));
  expect(update).not.toHaveBeenCalled();
});
it('rejects Undo after a newer note edit instead of overwriting it', async () => {
  const meta = { folders: [], dismissed: [] };
  const extra = { noteMeta: meta, onUpdateNoteMeta: vi.fn() };
  (find(render(false, extra), el => el.type === FolderPicker)!.props.onChange as (path: string) => void)('Tech');
  const undo = feedback.toast.mock.calls.at(-1)![1].action.onClick;
  const newer = [{ ...update.mock.calls.at(-1)![0][0], content: 'Newer edit' }];
  render(false, { ...extra, notes: newer });
  update.mockClear();
  undo();
  expect(update).not.toHaveBeenCalled();
  expect(feedback.toast).toHaveBeenLastCalledWith("Can't undo: the notes changed since.", { tone: 'error' });
});

it('does not combine a hidden desktop Back button with a display utility', () => {
  vi.stubGlobal('window', { innerWidth: 1440 });
  expect(find(render(), el => el.props['aria-label'] === 'Back to notes')!.props.className).toBe('hidden');
});

// Fix round 1 regressions.
it('keeps the existing strip next to the new navigation when minimized', () => {
  vi.stubGlobal('window', { innerWidth: 1440 });
  find(render(), el => el.props['aria-label'] === 'Minimize folders')!.props.onClick();
  const tree = render();
  expect(find(tree, el => el.type === NoteFolderTree)?.props.minimized).toBe(true);
  expect(find(tree, el => el.type === NoteNavigation)).toBeDefined();
});

it.each(['', 'Tech'])('keeps every note available when the current folder changes (%s)', path => {
  const fixtures = [{ ...note, id: 'root', folder: '' }, { ...note, id: 'java', folder: 'Tech/Java' }, note];
  const extra = { notes: fixtures };
  (find(render(false, extra), el => el.type === NoteNavigation)!.props.onSelectFolder as (path: string) => void)(path);
  expect(find(render(false, extra), el => el.type === NoteNavigation)?.props.notes).toEqual(fixtures);
  expect(find(render(false, extra), el => el.type === NoteNavigation)?.props.currentFolder).toBe(path);
});
it('deleting a top-level folder keeps all resulting notes and marks the confirmation dangerous', async () => {
  const other = { ...note, id: 'other', title: 'Other note', folder: 'Other' };
  const extra = { notes: [note, other] };
  (find(render(false, extra), el => el.type === NoteNavigation)!.props.onFolderAction as (action: string, path: string) => void)('delete', 'Work');
  await Promise.resolve();
  expect(feedback.confirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
  const tree = render(false, { notes: update.mock.calls.at(-1)![0] });
  expect(find(tree, el => el.type === NoteNavigation)?.props.currentFolder).toBe('');
  expect(find(tree, el => el.type === NoteNavigation)?.props.notes).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'other', folder: 'Other' }), expect.objectContaining({ id: note.id, folder: '' })]));
});
it.each([true, false])('selecting a drawer folder returns an open editor to its list (compact=%s)', compact => {
  vi.stubGlobal('window', { innerWidth: 900 });
  const first = render(compact);
  (find(first, el => el.type === NoteNavigation)!.props.onOpenNote as (id: string) => void)(note.id);
  const editor = render(compact);
  find(editor, el => el.props['aria-label'] === 'Folders')!.props.onClick();
  (find(render(compact), el => el.type === NoteFolderTree)!.props.onSelect as (path: string) => void)('Work');
  const tree = render(compact);
  const search = find(tree, el => el.type === NoteNavigation);
  expect(search).toBeDefined();
  if (!compact) {
    expect(find(tree, el => el.props['aria-label'] === 'Notes navigation')!.props.className).not.toContain('hidden');
  }
});
it('restores the Notes heading on the compact list', () => {
  expect(find(render(true), el => el.type === 'h1' && el.props.children === 'Notes')).toBeDefined();
});
it('ignores a folder self-drop but refuses a descendant drop', () => {
  const drop = find(render(), el => el.type === NoteNavigation)!.props.onDropFolder as (path: string, parent: string) => void;
  drop('Work', ' work ');
  expect(feedback.toast).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
  drop('Work', 'Work/Java');
  expect(feedback.toast).toHaveBeenCalledWith('A folder cannot move inside itself.', { tone: 'error' });
  expect(update).not.toHaveBeenCalled();
});

it('leaves focus mode when a drawer folder selection returns to the list', () => {
  vi.stubGlobal('window', { innerWidth: 900 });
  find(render(), el => el.props['aria-label'] === 'Focus mode')!.props.onClick();
  find(render(), el => el.props['aria-label'] === 'Folders')!.props.onClick();
  (find(render(), el => el.type === NoteFolderTree)!.props.onSelect as (path: string) => void)('Work');
  expect(find(render(), el => el.type === NoteNavigation)).toBeDefined();
});

it('opens a tree note into its folder, expands ancestors, and creates there without saving on render', () => {
  const child = { ...note, id: 'child', title: 'Child', folder: 'Tech/Java' };
  const extra = { notes: [note, child] };
  const navigation = () => find(render(false, extra), el => typeof el.type === 'function' && el.type.name === 'NoteNavigation')!;
  expect(update).not.toHaveBeenCalled();
  expect(navigation()).toBeDefined();
  (navigation().props.onOpenNote as (id: string) => void)('child');
  expect(navigation().props.currentFolder).toBe('Tech/Java');
  expect(navigation().props.expanded).toEqual(new Set(['work', 'tech', 'tech/java']));
  (navigation().props.onNewNote as () => void)();
  expect(update.mock.calls.at(-1)![0][0].folder).toBe('Tech/Java');
});
it('wiki opening expands the path and search preserves the open note in navigation', () => {
  const child = { ...note, id: 'child', title: 'Child', folder: 'Tech/Java' };
  const extra = { notes: [note, child] };
  (find(render(false, extra), el => el.props.noteId === note.id)!.props.onOpenLink as (title: string) => void)('Child');
  const nav = find(render(false, extra), el => typeof el.type === 'function' && el.type.name === 'NoteNavigation')!;
  expect(nav).toBeDefined(); expect(nav.props.currentFolder).toBe('Tech/Java');
  expect(nav.props.expanded).toEqual(new Set(['work', 'tech', 'tech/java']));
  (nav.props.onQueryChange as (q: string) => void)('absent');
  const next = find(render(false, extra), el => typeof el.type === 'function' && el.type.name === 'NoteNavigation')!;
  expect(next.props.openNoteId).toBe('child'); expect(next.props.query).toBe('absent');
  expect(update).not.toHaveBeenCalled();
});
it('new folder is created inside the current folder and pinning feeds the tree', async () => {
  const nav = () => find(render(), el => typeof el.type === 'function' && el.type.name === 'NoteNavigation')!;
  expect(nav()).toBeDefined();
  (nav().props.onSelectFolder as (path: string) => void)('Tech');
  (nav().props.onNewFolder as () => void)();
  expect(find(render(), el => el.type === FolderDialogs)?.props.path).toBe('Tech');
  find(render(), el => el.props['aria-label'] === 'Pin note to the top')!.props.onClick();
  const next = find(render(false, { notes: update.mock.calls.at(-1)![0] }), el => typeof el.type === 'function' && el.type.name === 'NoteNavigation')!;
  expect((next.props.notes as StandaloneNote[])[0].pinned).toBe(true);
});

it('reveals the fallback note after the active note disappears during sync', () => {
  vi.stubGlobal('window', { setInterval: vi.fn(), clearInterval: vi.fn() });
  vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  render();
  const other = { ...note, id: 'other', folder: 'Archive/2026' };
  render(false, { notes: [other] }); hooks.effects.forEach(effect => effect());
  const nav = find(render(false, { notes: [other] }), el => el.type === NoteNavigation)!;
  expect(nav.props.openNoteId).toBe('other');
  expect(nav.props.currentFolder).toBe('Archive/2026');
  expect(nav.props.expanded).toEqual(new Set(['work', 'archive', 'archive/2026']));
  expect(update).not.toHaveBeenCalled();
});
