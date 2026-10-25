// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Editor } from '@tiptap/core';
import RichNoteEditor from './RichNoteEditor';
import { cleanPastedHtml, extractEmbeddedImages } from './clipboard';

vi.mock('../../utils/notePicture', () => ({ encodeNotePicture: async () => ({ blob: new Blob(['small']), mime: 'image/webp', width: 1, height: 1 }) }));
vi.mock('../../utils/noteAssets', async (original) => ({ ...await original<typeof import('../../utils/noteAssets')>(), putAsset: async () => 'a'.repeat(64), getAssetUrl: async () => null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = ''; });
async function mount(markdown = '') {
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(React.createElement(RichNoteEditor, { noteId: 'clipboard', markdown, onChange() {}, onOpenLink() {}, notes: [], onCreateNote: () => '' })));
  return (host.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
}
async function paste(editor: Editor, html: string, text = '') {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/html' ? html : type === 'text/plain' ? text : '', files: [], types: ['text/html', 'text/plain'] } });
  await act(async () => { editor.view.dom.dispatchEvent(event); });
}
it.each(['chatgpt', 'claude', 'gemini', 'article'])('%s paste preserves structures in serialised Markdown and removes chrome', async (name) => {
  const editor = await mount();
  await paste(editor, readFileSync(`src/components/notes/fixtures/paste/${name}.html`, 'utf8'));
  const markdown = editor.getMarkdown();
  expect(markdown).toMatch(/\| -{3,} \|/);
  if (markdown.includes('Alpha')) expect(markdown).toMatch(/\| Name\s*\| Value\s*\|/);
  for (const expected of ['##', '**Bold**', '*italic*', '- First', 'Nested', '1. Ordered', '> A quotation', '```python\nprint("hello")\n```', '![Chart](https://example.com/chart.png)']) expect(markdown).toContain(expected);
  for (const junk of ['style=', 'class=', '<script', 'alert(1)', 'tracking()', 'Copy', 'Edit', 'Subscribe', 'Sponsored', 'Buy now', 'Site footer', 'blob:', 'data:']) expect(markdown).not.toContain(junk);
  if (name === 'chatgpt') expect(markdown).toContain('- [ ] Review');
  if (name === 'claude') expect(markdown).toContain('x + y');
  if (name === 'gemini') expect(markdown).toContain(`daymark-asset:${'a'.repeat(64)}.webp`);
});
it('Markdown plain text paste parses headings, tasks, code and tables', async () => {
  const editor = await mount();
  await paste(editor, '', '## Heading\n\n- [ ] Review\n\n```python\nprint(1)\n```\n\n| A |\n| --- |\n| B |');
  const markdown = editor.getMarkdown();
  expect(markdown).toMatch(/\| -{3,} \|/);
  if (markdown.includes('Alpha')) expect(markdown).toMatch(/\| Name\s*\| Value\s*\|/);
  for (const expected of ['## Heading', '- [ ] Review', '```python\nprint(1)\n```', '| --- |']) expect(markdown).toContain(expected);
});
it.each(['ctrlKey', 'metaKey'])('Shift paste with %s inserts literal plain text even when HTML is available', async (modifier) => {
  const editor = await mount();
  editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', [modifier]: true, shiftKey: true, bubbles: true }));
  await paste(editor, '<h2>Formatted</h2>', '## Literal');
  expect(editor.getMarkdown()).toBe('\\## Literal');
  await paste(editor, '<h2>Next</h2>');
  expect(editor.getMarkdown()).toContain('## Next');
});
it('copy puts Markdown for only the selected content in text/plain and leaves formatted HTML', async () => {
  const editor = await mount('Before\n\n## Heading\n\n**Bold** and *italic*\n\nAfter');
  const start = editor.state.doc.child(0).nodeSize;
  const end = editor.state.doc.content.size - editor.state.doc.lastChild!.nodeSize;
  await act(async () => { editor.commands.setTextSelection({ from: start + 1, to: end - 1 }); });
  const copied = editor.view.serializeForClipboard(editor.state.selection.content());
  expect(copied.text).toBe('## Heading\n\n**Bold** and *italic*');
  expect(copied.dom.innerHTML).toContain('<h2');
  expect(copied.dom.innerHTML).toContain('<strong>Bold</strong>');
});



it('sanitises HTML inside Markdown plain text paste before it can enter the note', async () => {
  const editor = await mount();
  await paste(editor, '', '## Safe\n\n<script>alert(1)</script>\n\n<p style="color:red"><b>Keep</b><img src="javascript:bad" onerror="evil()"></p>');
  const markdown = editor.getMarkdown();
  expect(markdown).toContain('## Safe');
  expect(markdown).toContain('**Keep**');
  for (const unsafe of ['script', 'alert(1)', 'style=', 'javascript:', 'onerror']) expect(markdown).not.toContain(unsafe);
});
it('clean HTML keeps only safe sources, code language, semantic structure and checked tasks', async () => {
  const editor = await mount();
  const html = '<div>First line</div><div>Second line</div><p><s>Gone</s> <code class="other language-python extra" style="color:red">x</code><a href="javascript:evil()">Safe text</a><img src="http://example.com/no.png"><img src="blob:no"><img src="data:image/png;base64,eA=="><img src="https://example.com/yes.png" alt="Yes" srcset="http://bad" onerror="evil()"></p><ul><li><input type="checkbox" checked>Done</li><li><input type="checkbox">Todo</li></ul>';
  const clean = cleanPastedHtml(html);
  expect(clean).not.toMatch(/style=|class="other|srcset|onerror|javascript:|http:|blob:|data:image|<div|<span/);
  expect(clean).toContain('class="language-python"');
  await paste(editor, html);
  const markdown = editor.getMarkdown();
  for (const expected of ['First line\n\nSecond line', '~~Gone~~', '`x`', 'Safe text', '![Yes](https://example.com/yes.png)', '- [x] Done', '- [ ] Todo']) expect(markdown).toContain(expected);
});
it('extracts embedded image bytes and ignores malformed data, remote images and UI images', async () => {
  const blobs = extractEmbeddedImages('<img src="data:image/png;base64,eA=="><img src="data:image/svg+xml,%3Csvg%2F%3E"><img src="data:image/png;base64,!!"><img src="data:text/html;base64,eA=="><img src="blob:no"><img src="https://example.com/a.png"><nav><img src="data:image/png;base64,eA=="></nav>');
  expect(blobs.map(blob => [blob.type, blob.size])).toEqual([['image/png', 1], ['image/svg+xml', 6]]);
  expect(await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blobs[0]); })).toBe('x');
});
it('pastes normal plain prose and keeps Markdown literal inside code blocks', async () => {
  const editor = await mount();
  await paste(editor, '', 'Some ordinary prose');
  expect(editor.getMarkdown()).toBe('Some ordinary prose');
  await act(async () => { editor.commands.setContent('```python\nx\n```', { contentType: 'markdown' }); editor.commands.setTextSelection(2); });
  await paste(editor, '<h2>Heading</h2>', '## literal');
  expect(editor.getMarkdown().trim()).toBe('```python\nx## literal\n```');
});

it('an abandoned Shift paste shortcut does not affect a later context-menu paste', async () => {
  const editor = await mount();
  editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, shiftKey: true, bubbles: true }));
  editor.view.dom.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true }));
  await paste(editor, '<h2>Formatted</h2>', '## Literal');
  expect(editor.getMarkdown().trim()).toBe('## Formatted');
});
