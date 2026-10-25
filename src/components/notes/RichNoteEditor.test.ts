// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import RichNoteEditor from './RichNoteEditor';
import type { Editor } from '@tiptap/core';
import { readFileSync } from 'node:fs';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// jsdom has no layout; ProseMirror uses Range geometry when focusing a command.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function core(host: HTMLElement) {
  return (host.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
}

it('does not undo a sync replacement or write stale content', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); const onChange = vi.fn();
  const props = { noteId: 'sync', markdown: 'Before sync', onChange, onOpenLink: vi.fn(), notes: [], onCreateNote: () => 'new' };
  await act(async () => { root.render(React.createElement(RichNoteEditor, props)); });
  await act(async () => { core(host).commands.insertContentAt(core(host).state.doc.content.size - 1, ' local edit'); });
  onChange.mockClear();
  await act(async () => { root.render(React.createElement(RichNoteEditor, { ...props, markdown: 'Incoming sync' })); });
  await act(async () => { core(host).commands.undo(); });
  expect(core(host).getMarkdown()).toBe('Incoming sync');
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => { root.unmount(); });
});

it.each(['a <span>x</span> b', '<u>under</u>', '[[Note|alias]]', '> [!NOTE]', 'Tom & Jerry < 3', '&nbsp;', '5 * 3', 'a_b_c', '$x_1$'])('emits the original serialised source after editing elsewhere: %s', async (markdown) => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); const onChange = vi.fn();
  await act(async () => { root.render(React.createElement(RichNoteEditor, { noteId: 'fidelity', markdown: `${markdown}\n\nElsewhere`, onChange, onOpenLink: vi.fn(), notes: [], onCreateNote: () => 'new' })); });
  await act(async () => { core(host).view.dispatch(core(host).state.tr.insertText(' updated', core(host).state.doc.content.size - 1)); });
  expect(onChange).toHaveBeenLastCalledWith(`${markdown}\n\nElsewhere updated`);
  await act(async () => { root.unmount(); });
});

it.each(['| A | B |\n| --- | --- |\n| 1 | 2 |', '```typescript\nconst x = 1;\n```', '<div>raw</div>'])('focus/click of an unedited trailing block never saves: %s', async (markdown) => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); const onChange = vi.fn();
  await act(async () => { root.render(React.createElement(RichNoteEditor, { noteId: 'tail', markdown, onChange, onOpenLink: vi.fn(), notes: [], onCreateNote: () => 'new' })); });
  await act(async () => { core(host).commands.focus('end', { scrollIntoView: false }); core(host).view.dispatch(core(host).state.tr); core(host).view.dom.click(); });
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => { root.unmount(); });
});

it('opens a clicked wiki title and provides icon tooltips plus Markdown in the toolbar', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); const onOpenLink = vi.fn(); const onToggleMarkdown = vi.fn();
  await act(async () => { root.render(React.createElement(RichNoteEditor, { noteId: 'links', markdown: '[[Another Note]]', onChange: vi.fn(), onOpenLink, notes: [], onCreateNote: () => 'new', onToggleMarkdown })); });
  await act(async () => { host.querySelector('[data-wiki-title]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(onOpenLink).toHaveBeenCalledWith('Another Note');
  for (const label of ['Bold', 'Italic', 'Strike', 'Heading', 'Bullet list', 'Numbered list', 'Checkbox list', 'Quote', 'Code block', 'Table', 'Link', 'Picture', 'Diagram', 'Markdown']) {
    const control = host.querySelector(`[role="toolbar"] [aria-label="${label}"]`);
    expect(control?.getAttribute('title')).toBeTruthy(); expect(control?.querySelector('svg')).not.toBeNull();
  }
  await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="Markdown"]')!.click(); });
  expect(onToggleMarkdown).toHaveBeenCalledOnce();
  await act(async () => { root.unmount(); });
});

it('lays out actual TipTap task node views beside their checkbox and wraps tables', async () => {
  const style = document.createElement('style'); style.textContent = readFileSync('src/components/notes/richNoteEditor.css', 'utf8'); document.head.append(style);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(RichNoteEditor, { noteId: 'layout', markdown: '- [ ] Wrap beside checkbox\n\n| A | B |\n| --- | --- |\n| 1 | 2 |', onChange: vi.fn(), onOpenLink: vi.fn(), notes: [], onCreateNote: () => 'new' })); });
  const item = host.querySelector('ul[data-type="taskList"] > li')!;
  expect(getComputedStyle(item).display).toBe('flex');
  expect(host.querySelector('.tableWrapper table')).not.toBeNull();
  expect(host.querySelector('.h-14')).toBeNull();
  await act(async () => { root.unmount(); }); style.remove();
});

it('unedited note is not re-serialised, including incoming content changes', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  const props = { noteId: 'one', markdown: '#  Original\n\n<!-- untouched -->\n', onChange, onOpenLink: vi.fn(), notes: [], onCreateNote: () => 'new' };
  await act(async () => { root.render(React.createElement(RichNoteEditor, props)); });
  expect(host.querySelector('[contenteditable="true"]')).not.toBeNull();
  await act(async () => { root.render(React.createElement(RichNoteEditor, { ...props, markdown: '# Incoming\n\n' })); });
  expect(host.textContent).toContain('Incoming');
  await act(async () => { root.unmount(); });
  expect(onChange).not.toHaveBeenCalled();
});

it('serialises a formatting edit and preserves unsupported content', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  await act(async () => { root.render(React.createElement(RichNoteEditor, { noteId: 'one', markdown: 'Original\n\n<div>keep me</div>', onChange, onOpenLink: vi.fn(), notes: [], onCreateNote: () => 'new' })); });
  await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="Bullet list"]')!.click(); });
  expect(onChange).toHaveBeenCalled();
  expect(onChange.mock.calls.at(-1)![0]).toContain('<div>keep me</div>');
  expect(onChange.mock.calls.at(-1)![0]).toContain('- Original');
  await act(async () => { root.unmount(); });
});

it('positions the phone toolbar above the visual viewport and hides it with the editor', async () => {
  const viewport = new EventTarget();
  Object.assign(viewport, { height: 500, offsetTop: 20 });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerWidth', 390);
  vi.stubGlobal('innerHeight', 844);
  // A navigation hidden while typing has a zero rect and must not be treated
  // as covering the whole viewport.
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Main');
  document.body.append(nav);
  let visible = true;
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => (visible ? [new DOMRect(0, 0, 390, 400)] : []) as unknown as DOMRectList);
  let resized: () => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resized = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(RichNoteEditor, { noteId: 'phone', markdown: 'Hello', onChange: vi.fn(), onOpenLink: vi.fn(), notes: [], onCreateNote: () => 'new' })); });
  const toolbar = () => document.querySelector('[role="toolbar"]')?.parentElement?.parentElement;
  expect(toolbar()?.style.bottom).toBe('324px');
  Object.assign(viewport, { height: 450, offsetTop: 30 });
  await act(async () => { viewport.dispatchEvent(new Event('scroll')); });
  expect(toolbar()?.style.bottom).toBe('364px');
  visible = false;
  await act(async () => { resized(); });
  expect(document.body.querySelector('.fixed [role="toolbar"]')).toBeNull();
  visible = true;
  await act(async () => { resized(); });
  expect(toolbar()?.style.bottom).toBe('364px');
  await act(async () => { root.unmount(); });
  expect(disconnect).toHaveBeenCalled();
  expect(document.querySelector('[role="toolbar"]')).toBeNull();
});
it('clearHistory prevents picture resurrection through Undo and Redo while preserving the document', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const ref = React.createRef<import('./RichNoteEditor').RichNoteEditorHandle>();
  const onChange = vi.fn();
  await act(async () => root.render(React.createElement(RichNoteEditor, {
    noteId: 'cleanup', markdown: 'Keep me', onChange, onOpenLink: vi.fn(), notes: [], onCreateNote: () => 'new', ref,
  })));
  const editor = core(host);
  await act(async () => { editor.commands.insertContent(' picture reference'); });
  expect(editor.can().undo()).toBe(true);
  await act(async () => { editor.commands.undo(); });
  const before = editor.getMarkdown();
  onChange.mockClear();
  await act(async () => ref.current!.clearHistory());
  expect(editor.can().undo()).toBe(false);
  expect(editor.can().redo()).toBe(false);
  expect(editor.getMarkdown()).toBe(before);
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => { editor.commands.insertContent(' new edit'); editor.commands.undo(); });
  expect(editor.getMarkdown()).toBe(before);
  await act(async () => root.unmount());
});
it('cleanup history cannot Undo the deletion of a picture reference', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const ref = React.createRef<import('./RichNoteEditor').RichNoteEditorHandle>();
  const source = `daymark-asset:${'a'.repeat(64)}.png`;
  await act(async () => root.render(React.createElement(RichNoteEditor, {
    noteId: 'deleted-picture', markdown: `Keep me\n\n![photo](${source})`, onChange: vi.fn(), onOpenLink: vi.fn(), notes: [], onCreateNote: () => 'new', ref,
  })));
  const editor = core(host);
  let imagePosition = -1;
  editor.state.doc.descendants((node, position) => { if (node.type.name === 'image') imagePosition = position; });
  expect(imagePosition).toBeGreaterThan(0);
  await act(async () => editor.commands.deleteRange({ from: imagePosition, to: imagePosition + 1 }));
  expect(editor.getMarkdown()).not.toContain(source);
  expect(editor.can().undo()).toBe(true);
  await act(async () => { ref.current!.clearHistory(); editor.commands.undo(); editor.commands.redo(); });
  expect(editor.getMarkdown()).not.toContain(source);
  await act(async () => root.unmount());
});
