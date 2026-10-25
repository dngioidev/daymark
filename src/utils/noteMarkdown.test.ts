// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { markdownToDoc, docToMarkdown } from './noteMarkdown';
import { editorExtensions } from '../components/notes/editorExtensions';

describe('note Markdown', () => {
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
    for (const value of ['[[Another Note]]', '#tag', 'image', 'taskList', 'table', 'mermaid', 'graph TD; A-->B']) expect(json).toContain(value);
    expect(JSON.stringify(markdownToDoc(docToMarkdown(doc)))).toContain('[[Another Note]]');
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
