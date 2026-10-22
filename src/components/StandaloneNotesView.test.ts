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
  useRef: () => ({ current: null }),
}));
vi.mock('../native/backButton', () => ({ useBackHandler: vi.fn() }));
vi.mock('./MarkdownPreview', () => ({ MarkdownPreview: () => React.createElement('p', null, 'Preview') }));
import { StandaloneNotesView } from './StandaloneNotesView';
import { Menu, type MenuItem } from './ui/Menu';

const note: StandaloneNote = { id: 'one', title: 'Existing', content: '# Hi there\n- [ ] one two', folder: 'Work', tags: [], pinned: false, createdAt: '2026-10-22T00:00:00Z', updatedAt: new Date().toISOString() };
const update = vi.fn();
function render(compact = false) {
  hooks.index = 0;
  hooks.effects = [];
  return StandaloneNotesView({ notes: [note], onUpdateNotes: update, compact }) as React.ReactElement;
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
  expect(find(tree, (el) => el.props.id === 'note-editor-textarea')).toBeDefined();
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

it.each(['ctrlKey', 'metaKey'])('toggles focus with %s + . and leaves textarea Escape alone', (modifier) => {
  const add = vi.fn();
  const remove = vi.fn();
  vi.stubGlobal('document', { addEventListener: add, removeEventListener: remove });
  vi.stubGlobal('window', { setInterval: vi.fn(), clearInterval: vi.fn() });
  render();
  let cleanups = hooks.effects.map((effect) => effect());
  let listener = add.mock.calls.find(([name]) => name === 'keydown')![1];
  const key = (key: string, typing = false, tagName = 'BUTTON') => ({ key, [modifier]: key === '.', preventDefault: vi.fn(), target: { closest: () => typing ? {} : null, tagName } });
  listener(key('.', true, 'INPUT'));
  expect(find(render(), (el) => el.props.id === 'notes-search')).toBeDefined();
  listener(key('.'));
  expect(find(render(), (el) => el.props.id === 'notes-search')).toBeUndefined();
  cleanups.forEach((cleanup) => { if (typeof cleanup === 'function') cleanup(); });
  expect(remove).toHaveBeenCalledWith('keydown', listener);
  add.mockClear();
  cleanups = hooks.effects.map((effect) => effect());
  listener = add.mock.calls.find(([name]) => name === 'keydown')![1];
  listener(key('Escape', true, 'TEXTAREA'));
  expect(find(render(), (el) => el.props.id === 'notes-search')).toBeUndefined();
  listener(key('Escape'));
  expect(find(render(), (el) => el.props.id === 'notes-search')).toBeDefined();
  cleanups.forEach((cleanup) => { if (typeof cleanup === 'function') cleanup(); });
});

it('keeps compact editing bounded and caps Read mode line length', () => {
  const tree = render(true);
  const listNote = find(tree, (el) => el.type === 'button' && el.props['aria-current'] === undefined && typeof el.props.onClick === 'function' && find(el.props.children as React.ReactNode, (child) => child.type === 'span' && child.props.children === 'Existing') !== undefined);
  expect(listNote).toBeDefined();
  listNote!.props.onClick();
  const html = renderToStaticMarkup(render(true));
  expect(html).toContain('max-w-[75ch] mx-auto');
  expect(html).not.toContain('min-h-[60dvh]');
  expect(html).not.toContain('aria-label="Focus mode"');
});

it('pins controls around a bounded editor and shows a Markdown word count', () => {
  const html = renderToStaticMarkup(render());
  expect(html).toContain('Saved · 4 words · edited');
  expect(html).toContain('h-full');
  expect(html).not.toContain('min-h-[60dvh]');
  expect(html).not.toContain('100dvh-3.5rem');
});
