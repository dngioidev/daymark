// Cycle 15 audit: real RichNoteEditor transitions (open, edit, undo/redo,
// incoming source replacement). Uses the shared fixture corpus.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import RichNoteEditor from '../components/notes/RichNoteEditor';
import { loadMarkdownRenderingCases } from '../test/markdownRenderingFixtures';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = ''; vi.restoreAllMocks(); });

async function mount(markdown: string, onChange: (m: string) => void) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const render = (value: string, noteId = 'audit') => act(async () => root!.render(React.createElement(RichNoteEditor, {
    noteId, markdown: value, onChange, onOpenLink() {}, notes: [], onCreateNote: () => '',
  })));
  await render(markdown);
  const editor = () => (host.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
  return { editor, render, host };
}

const cases = loadMarkdownRenderingCases().filter(c => c.source.trim() && c.id !== 'whitespace');

describe.each(cases)('$family: $id', c => {
  const source = c.source.replace(/\r\n/g, '\n').replace(/\s+$/, '');

  it('opening and focusing emits no save', async () => {
    const onChange = vi.fn();
    const { editor } = await mount(c.source, onChange);
    await act(async () => { editor().commands.focus(); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a real edit at the end saves and keeps every source token; undo/redo keep content', async () => {
    const onChange = vi.fn();
    const { editor } = await mount(`${source}\n\nEdit elsewhere`, onChange);
    await act(async () => { editor().view.dispatch(editor().state.tr.insertText(' updated', editor().state.doc.content.size - 1)); });
    expect(onChange).toHaveBeenCalled();
    const saved = onChange.mock.calls.at(-1)![0] as string;
    expect(saved).toContain('Edit elsewhere updated');
    for (const token of c.notes.sourceTokens) expect(saved, `saved token ${JSON.stringify(token)}`).toContain(token);
    if (c.fidelity === 'verbatim') expect(saved).toBe(`${source}\n\nEdit elsewhere updated`);

    await act(async () => { editor().commands.undo(); });
    const afterUndo = editor().getMarkdown();
    for (const token of c.notes.sourceTokens) expect(afterUndo, `undo token ${JSON.stringify(token)}`).toContain(token);
    await act(async () => { editor().commands.redo(); });
    const afterRedo = editor().getMarkdown();
    expect(afterRedo).toContain('Edit elsewhere updated');
    for (const token of c.notes.sourceTokens) expect(afterRedo, `redo token ${JSON.stringify(token)}`).toContain(token);
  });

  it('an edit at the beginning keeps the rest of the note', async () => {
    const onChange = vi.fn();
    const { editor } = await mount(`Start line\n\n${source}`, onChange);
    await act(async () => { editor().view.dispatch(editor().state.tr.insertText('X', 1)); });
    const saved = onChange.mock.calls.at(-1)![0] as string;
    expect(saved).toContain('XStart line');
    for (const token of c.notes.sourceTokens) expect(saved, `saved token ${JSON.stringify(token)}`).toContain(token);
  });

  it('replacing the source through the incoming prop shows the new note and does not save', async () => {
    const onChange = vi.fn();
    const { editor, render } = await mount('First note', onChange);
    await render(c.source, 'other-note');
    for (const visible of c.notes.visibleText) expect(editor().view.dom.textContent).toContain(visible);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('rich → Markdown → rich', () => {
  it('source written back through the incoming prop re-renders dividers', async () => {
    const onChange = vi.fn();
    const { editor, render } = await mount('Plain', onChange);
    await render('Intro\n\n---\n\nSecond\n\n---\n\nThird', 'divider-note');
    expect(editor().view.dom.querySelectorAll('hr')).toHaveLength(2);
    expect(editor().view.dom.textContent).toContain('Second');
  });
});
