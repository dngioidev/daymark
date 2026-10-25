// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Editor, getSchema } from '@tiptap/core';
import { markdownToDoc, docToMarkdown } from './noteMarkdown';
import { editorExtensions } from '../components/notes/editorExtensions';

function afterEdit(markdown: string, noop = false) {
  const editor = new Editor({ extensions: editorExtensions, content: `${markdown}\n\nEdit elsewhere`, contentType: 'markdown' });
  const transaction = noop
    ? editor.state.tr.replaceWith(0, editor.state.doc.content.size, editor.state.doc.content)
    : editor.state.tr.insertText(' updated', editor.state.doc.content.size - 1);
  expect(transaction.docChanged).toBe(true);
  editor.view.dispatch(transaction);
  const result = docToMarkdown(editor.getJSON());
  editor.destroy();
  return result;
}

describe('note Markdown', () => {
  it.each([
    'a <span>x</span> b', '<mark>hl</mark> <kbd>K</kbd>', '<u>under</u>',
    '[[X]]', '[[2026-10-25]]', '[[Note|alias]]', '![[Embed]]', '> [!NOTE]',
    '#tags', 'Tom & Jerry < 3', '&nbsp;', '5 * 3', 'a_b_c', '$x_1$',
    'A &copy; B &#160; C &#xA0; D > E',
    '**a <span>x</span> b**', '*a &nbsp; b*',
    '> first\n> second', '** bold **',
    'a <!-- inline comment --> b', 'a <?xml version="1.0"?> b', 'a <![CDATA[x < y]]> b',
  ])('preserves the serialised string after an unrelated real edit: %s', (markdown) => {
    expect(afterEdit(markdown)).toBe(`${markdown}\n\nEdit elsewhere updated`);
    expect(docToMarkdown(markdownToDoc(markdown))).toBe(markdown);
  });

  it.each(['rich-core', 'unsupported'])('preserves fixture tokens in the serialised string after real and no-op edit transactions: %s', (name) => {
    const md = readFileSync(`fixtures/notes/${name}.md`, 'utf8');
    const tokens = name === 'rich-core'
      ? ['# Heading one', '## Heading two', '### Heading three', '#### Heading four', '##### Heading five', '###### Heading six', '**Bold**', '*italic*', '~~strike~~', '`inline code`', '[[Another Note]]', '#tag', '- First', '- Nested', '1. Numbered', '- [ ] Todo', '- [x] Nested done', '| Left', 'Center', 'Right', '```typescript', 'const answer = 42;', '```mermaid', 'graph TD; A-->B', '> Quoted text', '> [!NOTE]', '> A callout remains readable.', '[Example](https://example.com)', '![Alt text](https://example.com/photo.webp)']
      : ['---\ntitle: Keep me\ncustom: [one, two]\n---', '[[Another Note]]', '#tag', 'footnote[^one]', '<section data-custom="yes">\n  <b>Original HTML</b>\n</section>', '```unknown-language extra=keep\n  untouched <syntax>\n```', '[^one]: Original footnote\n    with indentation'];
    for (const noop of [false, true]) {
      const result = afterEdit(md, noop);
      for (const token of tokens) expect(result).toContain(token);
      if (name === 'rich-core') expect(result).toMatch(/\|\s*:?-+\s*\|\s*:-+:\s*\|\s*-+:\s*\|/);
    }
  });

  it.each(['# literal', '- literal', '1. literal', '**literal**', '*literal*', '[literal](https://example.com)', '---', '```typescript', '~~~text'])('escapes newly inserted literal syntax that would change meaning: %s', (text) => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
    const result = docToMarkdown(doc);
    expect(markdownToDoc(result)).toEqual(doc);
  });

  it('escapes literal text touching a generated emphasis delimiter', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'a*' }, { type: 'text', text: 'b', marks: [{ type: 'italic' }] },
    ] }] };
    const result = docToMarkdown(doc);
    expect(result).toBe('a\\**b*');
    expect(markdownToDoc(result)).toEqual(doc);
  });

  it('escapes table cell pipes without corrupting the serialised table structure', () => {
    const markdown = '| A | B |\n| --- | --- |\n| one \\| two | [[Note\\|alias]] |';
    const result = afterEdit(markdown);
    expect(result).toContain('one \\| two');
    expect(result).toContain('[[Note\\|alias]]');
  });

  it('keeps angle-bracket autolinks as serialised links rather than raw HTML', () => {
    expect(afterEdit('<https://example.com>')).toContain('[https://example.com](https://example.com)');
  });
  it.each(['rich-core', 'unsupported'])('round trip preserves content: %s', (name) => {
    const md = readFileSync(`fixtures/notes/${name}.md`, 'utf8');
    const doc = markdownToDoc(md);
    expect(markdownToDoc(docToMarkdown(doc))).toEqual(doc);
    expect(() => getSchema(editorExtensions).nodeFromJSON(doc).check()).not.toThrow();
  });

  it.each([
    '---\ntitle: Unchanged\n---',
    '<div data-custom="yes">\n  <em>Keep HTML</em>\n</div>',
    '[^one]: Keep footnote\n    and indentation',
    '```unknown-language extra=keep\n  exact syntax\n```',
    '  ```unknown-language\n  exact syntax\n  ```',
    'A paragraph with a footnote[^one].',
    '[^one]: first paragraph\n\n    second paragraph',
  ])('unknown syntax kept verbatim in raw blocks: %s', (source) => {
    const doc = markdownToDoc(`${source}\n\nOrdinary paragraph`);
    expect(doc.content?.[0]).toMatchObject({ type: 'rawMarkdown', attrs: { source } });
    expect(docToMarkdown(doc)).toContain(source);
  });

  it('keeps wiki links, tags, images, tables, tasks and Mermaid content', () => {
    const doc = markdownToDoc(readFileSync('fixtures/notes/rich-core.md', 'utf8'));
    const json = JSON.stringify(doc);
    for (const value of ['wikiLink', '#tag', 'image', 'taskList', 'table', 'mermaid', 'graph TD; A-->B']) expect(json).toContain(value);
    expect(docToMarkdown(doc)).toContain('[[Another Note]]');
    expect(docToMarkdown(markdownToDoc(docToMarkdown(doc)))).toContain('[[Another Note]]');
  });

  it.each([
    'Before ![inline image](https://example.com/a.png) after.',
    '> <aside>Keep this block</aside>\n\nEnd.',
    '```unsupported\n  first\n\n  last\n```\n\nEnd.',
    '[^one]: first\n    second\n\nEnd.',
  ])('round trips mixed and nested content as a valid editor document: %s', (markdown) => {
    const doc = markdownToDoc(markdown);
    expect(() => getSchema(editorExtensions).nodeFromJSON(doc).check()).not.toThrow();
    expect(markdownToDoc(docToMarkdown(doc))).toEqual(doc);
  });
});
