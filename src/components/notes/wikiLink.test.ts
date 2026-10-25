// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import RichNoteEditor, { type RichNoteEditorProps } from './RichNoteEditor';
import { markdownToDoc, docToMarkdown } from '../../utils/noteMarkdown';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function mount(props: Partial<RichNoteEditorProps> = {}) {
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(React.createElement(RichNoteEditor, { noteId: 'wiki', markdown: '', onChange() {}, onOpenLink() {}, notes: [], onCreateNote: () => 'new', ...props })));
  return (host.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
}
async function type(editor: Editor, text: string) {
  await act(async () => { editor.view.dispatch(editor.state.tr.insertText(text)); });
}
async function key(editor: Editor, value: string) {
  await act(async () => { editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })); });
}
it('wiki link round trip with alias', () => {
  const source = '[[Title]] [[Title|alias]] ![[Embed]] [[2026-10-25]]';
  const doc = markdownToDoc(source);
  expect(doc.content?.[0].content?.filter(node => node.type === 'wikiLink').map(node => node.attrs)).toEqual([
    { title: 'Title', alias: null }, { title: 'Title', alias: 'alias' }, { title: '2026-10-25', alias: null },
  ]);
  expect(docToMarkdown(doc)).toBe(source);
});
it('suggestion filters and orders', async () => {
  const editor = await mount({ notes: Array.from({ length: 12 }, (_, i) => ({ id: String(i), title: `Note ${i}` })).reverse() });
  await type(editor, '[[nOtE');
  const options = [...document.querySelectorAll('[role="option"]')];
  expect(options.slice(0, 8).map(node => node.textContent)).toEqual(Array.from({ length: 8 }, (_, i) => `Note ${11 - i}`));
  expect(options).toHaveLength(9);
  await key(editor, 'ArrowDown'); await key(editor, 'Tab');
  expect(editor.getMarkdown()).toBe('[[Note 10]]');
});
it('create option only when no exact match', async () => {
  const create = vi.fn(() => 'created');
  const editor = await mount({ notes: [{ id: '1', title: 'Existing' }], onCreateNote: create });
  await type(editor, '[[existing');
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  await key(editor, 'Escape');
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  await act(async () => { editor.commands.setContent('', { contentType: 'markdown' }); });
  await type(editor, '[[New note'); await key(editor, 'Enter');
  expect(create).toHaveBeenCalledWith('New note');
  expect(editor.getMarkdown()).toBe('[[New note]]');
});
it('opens a wiki chip with Enter and preserves literal brackets and embeds', async () => {
  const open = vi.fn();
  const editor = await mount({ markdown: '[[Title|alias]] \\[\\[x\\]\\] ![[Embed]]', onOpenLink: open });
  const chips = document.querySelectorAll<HTMLElement>('[data-wiki-title]');
  expect(chips).toHaveLength(1);
  await act(async () => { chips[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(open).toHaveBeenCalledWith('Title');
  await type(editor, 'edit ');
  expect(editor.getMarkdown()).toContain('\\[\\[x\\]\\] ![[Embed]]');
});
it.each(['&nbsp;', '&amp;'])('typed entity-like text %s stays literal after reload', async (text) => {
  const editor = await mount(); await type(editor, text);
  expect(editor.getMarkdown()).toBe(`\\${text}`);
  expect(docToMarkdown(markdownToDoc(`\\${text}`))).toBe(`\\${text}`);
});
it('converts a fully typed wiki link and alias without leaving bracket text', async () => {
  const editor = await mount();
  for (const character of '[[Title|alias]]') {
    await act(async () => {
      const { from, to } = editor.state.selection;
      const handled = editor.view.someProp('handleTextInput', handler => handler(editor.view, from, to, character, () => editor.state.tr.insertText(character)));
      if (!handled) editor.view.dispatch(editor.state.tr.insertText(character));
    });
  }
  expect(editor.getJSON().content?.[0].content).toEqual([{ type: 'wikiLink', attrs: { title: 'Title', alias: 'alias' } }]);
  expect(editor.getMarkdown()).toBe('[[Title|alias]]');
});
it.each(['![[Embed', '\\[[Literal', '`[[Code`', '```\n[[Code\n```'])('does not suggest for literal/embed/code: %s', async markdown => {
  const editor = await mount({ markdown });
  await act(async () => { editor.commands.setTextSelection(editor.state.doc.content.size - 1); });
  await type(editor, 'x');
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});
it('tap inserts a link and copying keeps wiki Markdown', async () => {
  const editor = await mount({ notes: [{ id: 'one', title: 'One' }] });
  await type(editor, '[[On');
  await act(async () => { document.querySelector<HTMLButtonElement>('[role="option"]')!.click(); });
  expect(editor.getMarkdown()).toBe('[[One]]');
  await act(async () => { editor.commands.selectAll(); });
  expect(editor.view.serializeForClipboard(editor.state.selection.content()).text).toBe('[[One]]');
});
it.each(['**[[Title|alias]]**', '*[[Title]]*', '\\[\\[x\\]\\] &nbsp; \\&nbsp; ![[Embed]]'])('keeps wiki syntax in serialised Markdown: %s', async markdown => {
  const editor = await mount({ markdown: `${markdown}\n\nElsewhere` });
  await act(async () => { editor.view.dispatch(editor.state.tr.insertText(' edited', editor.state.doc.content.size - 1)); });
  expect(editor.getMarkdown()).toContain(markdown);
});
it('keeps a table wiki alias and its escaped pipe in serialised Markdown', async () => {
  const editor = await mount({ markdown: '| Link |\n| --- |\n| [[Title\\|alias]] |\n\nElsewhere' });
  await act(async () => { editor.view.dispatch(editor.state.tr.insertText(' edited', editor.state.doc.content.size - 1)); });
  expect(editor.getMarkdown()).toContain('[[Title\\|alias]]');
  const links: unknown[] = [];
  editor.state.doc.descendants(node => { if (node.type.name === 'wikiLink') links.push(node.attrs); });
  expect(links).toEqual([{ title: 'Title', alias: 'alias' }]);
});
it('fits above the caret inside the visual viewport when the keyboard is visible', async () => {
  vi.stubGlobal('visualViewport', { width: 390, height: 340, offsetLeft: 0, offsetTop: 200, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(360, 500, 10, 20));
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(528);
  const editor = await mount({ notes: [{ id: 'one', title: 'One' }] });
  await type(editor, '[[');
  const menu = document.querySelector<HTMLElement>('[role="listbox"]')!;
  expect(menu.style.top).toBe('208px');
  expect(menu.style.left).toBe('62px');
  expect(menu.style.maxHeight).toBe('288px');
});
