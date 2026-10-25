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
  await paste(editor, '', '## Safe\n\n- Item\n\n<script>alert(1)</script>\n\n<p style="color:red"><b>Keep</b><img src="javascript:bad" onerror="evil()"></p>');
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
it.each(['clean', 'images'])('%s sanitises raw HTML before any live-document parsing or adoption', (operation) => {
  const setter = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!.set!;
  const parsedIntoLive: string[] = [];
  const unsafeAdoptions: string[] = [];
  const spy = vi.spyOn(Element.prototype, 'innerHTML', 'set').mockImplementation(function (this: Element, html: string) {
    if (this.ownerDocument === document && /onerror/i.test(html)) parsedIntoLive.push(html);
    setter.call(this, html);
  });
  const append = Element.prototype.append;
  const adoptionSpy = vi.spyOn(Element.prototype, 'append').mockImplementation(function (this: Element, ...nodes: (Node | string)[]) {
    if (this.ownerDocument === document) for (const node of nodes) {
      if (typeof node !== 'string' && node instanceof Element && (node.hasAttribute('onerror') || node.querySelector('[onerror]'))) unsafeAdoptions.push(node.outerHTML);
      if (typeof node !== 'string' && node instanceof DocumentFragment && node.querySelector('[onerror]')) unsafeAdoptions.push('unsafe fragment');
    }
    append.apply(this, nodes);
  });
  try {
    const html = '<div><p>hello</p><img src="x:" onerror="window.__p=1"><img src="https://example.com/fail" onerror="window.__p=1"><img src="data:image/png;base64,eA==" onerror="window.__p=1"></div>';
    if (operation === 'clean') expect(cleanPastedHtml(html)).not.toContain('onerror');
    else expect(extractEmbeddedImages(html)).toHaveLength(1);
    expect(parsedIntoLive).toEqual([]);
    expect(unsafeAdoptions).toEqual([]);
  } finally { spy.mockRestore(); adoptionSpy.mockRestore(); }
});
it.each([
  ['callout', '> [!TIP] Advice\n> Keep **this**'],
  ['mermaid', '```mermaid\ngraph TD; A-->B\n```'],
  ['raw block', '<div>raw <u>source</u></div>'],
  ['wiki link', 'Visit [[Another Note|Alias]]'],
])('internal copy/paste preserves a %s in serialised Markdown', async (_name, markdown) => {
  const editor = await mount(markdown);
  await act(async () => { editor.commands.selectAll(); });
  const copied = editor.view.serializeForClipboard(editor.state.selection.content());
  expect(copied.dom.innerHTML).toContain('data-pm-slice');
  await act(async () => { editor.commands.setContent(''); });
  await paste(editor, copied.dom.innerHTML, copied.text);
  expect(editor.getMarkdown().trim()).toBe(markdown);
  if (_name === 'mermaid') expect(editor.getJSON().content?.[0]?.type).toBe('mermaid');
});
it('KaTeX clipboard retains only TeX annotations with inline and display delimiters', async () => {
  const editor = await mount();
  await paste(editor, readFileSync('src/components/notes/fixtures/paste/katex.html', 'utf8'));
  expect(editor.getMarkdown().trim()).toBe('Inline $x_1 + y$ formula.\n\n$$\\sum_{i=1}^{n} i$$');
});
it('keeps Copy, Copy code and Edit when they are ordinary prose spans', async () => {
  const editor = await mount();
  await paste(editor, '<p><span>Copy</span> <span>Copy code</span> <span>Edit</span></p>');
  expect(editor.getMarkdown().trim()).toBe('Copy Copy code Edit');
});
it('a single list signal leaves prose literal, while two signals preserve soft line breaks', async () => {
  const editor = await mount();
  await paste(editor, '', 'Some prose\n- one stray line\nMore prose');
  expect(editor.getMarkdown()).toContain('\\- one stray line');
  await act(async () => { editor.commands.setContent(''); });
  await paste(editor, '', '## Title\nFirst line\nSecond line\n\n- Item');
  expect(editor.getMarkdown().trim()).toBe('## Title\n\nFirst line  \nSecond line\n\n- Item');
});
it.each(['```python\nprint(1)\n```', '| A |\n| --- |\n| B |'])('a single fence or table is enough to detect Markdown: %s', async (markdown) => {
  const editor = await mount();
  await paste(editor, '', markdown);
  expect(editor.getMarkdown().trim()).toBe(markdown);
});
it.each([['Python', 'python'], ['JavaScript', 'javascript'], ['TypeScript', 'typescript'], ['Shell', 'bash'], ['Bash', 'bash']])('infers %s from a nested Gemini toolbar', async (label, language) => {
  const editor = await mount();
  await paste(editor, `<code-block><div class="code-block-decoration"><span>${label}</span><div><button>Copy code</button></div></div><div class="formatted-code-block-internal-container"><div class="animated-opacity"><pre><code class="code-container formatted">echo(1)</code></pre></div></div></code-block>`);
  expect(editor.getMarkdown().trim()).toBe('```' + language + '\necho(1)\n```');
});
