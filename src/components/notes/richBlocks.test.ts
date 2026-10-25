// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { markdownToDoc, docToMarkdown } from '../../utils/noteMarkdown';
import { editorExtensions } from './editorExtensions';

describe('rich note blocks', () => {
  it.each(['NOTE', 'TIP', 'INFO', 'WARNING', 'DANGER', 'SUCCESS', 'QUESTION', 'QUOTE'])('callout round trip: %s', (type) => {
    const markdown = `> [!${type}] A title\n> **Body** and [[Link]]\n>\n> Second paragraph`;
    const doc = markdownToDoc(markdown);
    expect(doc.content?.[0]).toMatchObject({ type: 'callout', attrs: { type: type.toLowerCase(), title: 'A title' } });
    expect(docToMarkdown(doc)).toBe(markdown);
    const editor = new Editor({ extensions: editorExtensions, content: `${markdown}\n\nElsewhere`, contentType: 'markdown' });
    editor.view.dispatch(editor.state.tr.insertText(' edited', editor.state.doc.content.size - 1));
    expect(editor.getMarkdown()).toBe(`${markdown}\n\nElsewhere edited`);
    editor.destroy();
  });
  it('serialises edited callout body with the callout prefix', () => {
    const doc = markdownToDoc('> [!TIP] Title\n> Body');
    doc.content![0].content![0].content![0].text = 'Changed';
    expect(docToMarkdown(doc)).toBe('> [!TIP] Title\n> Changed');
  });
  it('mermaid fence round trip', () => {
    const markdown = '```mermaid\ngraph TD\n  A[Start] --> B[Finish]\n```';
    const doc = markdownToDoc(markdown);
    expect(doc.content?.[0]).toMatchObject({ type: 'mermaid', attrs: { source: 'graph TD\n  A[Start] --> B[Finish]' } });
    expect(docToMarkdown(doc)).toBe(markdown);
  });
  it('highlights code without changing the serialised language or source', () => {
    const markdown = '```ts\nconst answer = 42;\n```';
    const editor = new Editor({ extensions: editorExtensions, content: markdown, contentType: 'markdown' });
    expect(editor.view.dom.querySelector('.hljs-keyword')?.textContent).toBe('const');
    expect(editor.getMarkdown()).toBe(markdown);
    editor.destroy();
  });
});

it('labels each code block with its language', () => {
  const editor = new Editor({ extensions: editorExtensions, content: '```python\nprint(42)\n```', contentType: 'markdown' });
  expect(editor.view.dom.querySelector('pre')?.getAttribute('data-language')).toBe('python');
  editor.destroy();
});

it.each([
  '> [!tip]  Keep spacing  \n> ![Alt](https://example.com/p.png)\n>\n> - [ ] Task\n>   - Nested',
  '> [!NOTE] Code\n> ```ts\n> const x = 1;\n> ```',
  '> [!NOTE] Outer\n> > [!TIP] Inner\n> > Body',
])('preserves complex untouched callouts after unrelated edits: %s', (markdown) => {
  const editor = new Editor({ extensions: editorExtensions, content: `${markdown}\n\nElsewhere`, contentType: 'markdown' });
  editor.view.dispatch(editor.state.tr.insertText(' edited', editor.state.doc.content.size - 1));
  expect(editor.getMarkdown()).toBe(`${markdown}\n\nElsewhere edited`);
  editor.destroy();
});
