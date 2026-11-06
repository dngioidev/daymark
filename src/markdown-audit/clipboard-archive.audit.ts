// Cycle 15 audit: clipboard events through the real editor, and full-fidelity
// versus Markdown-only archive round trips for corpus notes and daily files.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import RichNoteEditor from '../components/notes/RichNoteEditor';
import { DEFAULT_SETTINGS } from '../utils/defaultData';
import { buildVaultZip, importVaultFromZip } from '../utils/vaultArchive';
import { parseDailyDocument, serializeDailyDocument } from '../utils/markdownEngine';
import { loadMarkdownRenderingCases } from '../test/markdownRenderingFixtures';
import type { DailyDocument, StandaloneNote } from '../types/daymark';

vi.mock('../utils/notePicture', () => ({ encodeNotePicture: async () => ({ blob: new Blob(['small']), mime: 'image/webp', width: 1, height: 1 }) }));
vi.mock('../utils/noteAssets', async original => ({ ...await original<typeof import('../utils/noteAssets')>(), putAsset: async () => 'a'.repeat(64), getAssetUrl: async () => null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = ''; });

async function mount(markdown = '') {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(React.createElement(RichNoteEditor, { noteId: 'clip', markdown, onChange() {}, onOpenLink() {}, notes: [], onCreateNote: () => '' })));
  return (host.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
}
async function paste(editor: Editor, html: string, text = '') {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: (t: string) => t === 'text/html' ? html : t === 'text/plain' ? text : '', files: [], types: ['text/html', 'text/plain'] } });
  await act(async () => { editor.view.dom.dispatchEvent(event); });
}

describe('clipboard through the real editor paste event', () => {
  it.each([
    ['bulleted list', '<ul><li>one</li><li>two</li></ul>', '- one', '- two'],
    ['numbered list', '<ol><li>first</li><li>second</li></ol>', '1. first', '2. second'],
    ['inline marks', '<p><strong>bold</strong> <em>it</em> <s>gone</s> <code>x</code></p>', '**bold**', '`x`'],
    ['code block', '<pre><code class="language-js">let a = 1;</code></pre>', '```js', 'let a = 1;'],
    ['table', '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>B</td></tr></tbody></table>', '| A |', '| B |'],
    ['link', '<p><a href="https://example.com">site</a></p>', '[site](https://example.com)', ''],
    ['image', '<p><img src="https://example.com/p.png" alt="pic"></p>', '![pic](https://example.com/p.png)', ''],
  ])('pastes %s as Markdown', async (_name, html, a, b) => {
    const editor = await mount();
    await paste(editor, html);
    const markdown = editor.getMarkdown();
    expect(markdown).toContain(a);
    if (b) expect(markdown).toContain(b);
  });

  it('pasted plain-text wiki link stays a literal [[link]] source', async () => {
    const editor = await mount();
    await paste(editor, '', 'See [[Another Note]] today');
    expect(editor.getMarkdown()).toContain('[[Another Note]]');
  });

  it('pasted scripts, handlers and unsafe schemes never reach the saved source', async () => {
    const editor = await mount();
    await paste(editor, '<p onclick="x()">hi<script>bad()</script><a href="javascript:bad()">j</a><img src="data:image/png;base64,YQ==" onerror="bad()"></p>');
    expect(editor.getMarkdown()).not.toMatch(/script|onclick|onerror|javascript:|data:image/);
  });
});

const NOTE_TIME = '2026-11-03T10:00:00Z';
const notes: StandaloneNote[] = loadMarkdownRenderingCases()
  .filter(c => c.source.trim())
  .map(c => ({ id: `n-${c.id}`, title: `Fixture ${c.id}`, folder: 'Audit', content: c.source, tags: [], createdAt: NOTE_TIME, updatedAt: NOTE_TIME }));

const dailyMarkdown = [
  '---', 'date: 2026-11-03', 'type: daily', '---', '', '# Work', '',
  '- [ ] Keep identity', '  <!-- daymark: task_id=fixed-id-1 status=todo created=2026-11-01 carried_from=2026-11-02 -->',
  '- [x] Finished', '  <!-- daymark: task_id=fixed-id-2 status=done created=2026-11-01 completed=2026-11-03 -->', '',
  '# Ideas', '', '---', '', 'Idea body with a divider above', '',
].join('\n');
const daily: DailyDocument = parseDailyDocument(dailyMarkdown, '2026-11-03');

describe('archives', () => {
  it('full-fidelity archive restores every corpus note and the daily document exactly', async () => {
    const restored = await importVaultFromZip(await buildVaultZip([daily], notes, DEFAULT_SETTINGS));
    expect(restored.docs).toEqual([daily]);
    expect(restored.notes.map(n => [n.id, n.content])).toEqual(notes.map(n => [n.id, n.content]));
  });

  it('full-fidelity archive keeps task identity, status and provenance', async () => {
    const restored = await importVaultFromZip(await buildVaultZip([daily], notes, DEFAULT_SETTINGS));
    const tasks = restored.docs[0].headings.flatMap(h => h.items);
    expect(tasks.map(t => [t.id, t.status])).toEqual([['fixed-id-1', 'todo'], ['fixed-id-2', 'done']]);
    expect(tasks[0].carriedFromDate).toBe('2026-11-02');
    expect(tasks[1].completedDate).toBe('2026-11-03');
  });

  async function markdownOnly() {
    const zip = await JSZip.loadAsync(await buildVaultZip([daily], notes, DEFAULT_SETTINGS));
    for (const name of Object.keys(zip.files)) if (name.endsWith('.daymark/vault.json')) zip.remove(name);
    return importVaultFromZip(await zip.generateAsync({ type: 'uint8array' }));
  }

  it.each(notes.map(n => [n.id, n] as const))('Markdown-only import keeps the body of %s', async (_id, note) => {
    const restored = await markdownOnly();
    const found = restored.notes.find(n => n.title === note.title);
    expect(found, 'note restored by title').toBeDefined();
    expect(found!.content.replace(/\r\n/g, '\n').trim()).toBe(note.content.replace(/\r\n/g, '\n').trim());
  });

  it('Markdown-only import keeps daily task identity, status and provenance', async () => {
    const restored = await markdownOnly();
    const tasks = restored.docs.flatMap(d => d.headings.flatMap(h => h.items));
    expect(tasks.map(t => [t.id, t.status])).toEqual([['fixed-id-1', 'todo'], ['fixed-id-2', 'done']]);
    expect(tasks[0].carriedFromDate).toBe('2026-11-02');
  });

  it('Markdown-only import keeps the Ideas section body below a divider', async () => {
    const restored = await markdownOnly();
    const ideas = restored.docs[0].headings.find(h => h.name === 'Ideas');
    expect(ideas?.notesContent ?? '').toContain('Idea body with a divider above');
  });

  it('[characterisation] unknown document-level daily header fields are not stored (existing limitation)', () => {
    const custom = '---\ndate: 2026-11-03\ntype: daily\ncustom_field: keep-me\n---\n\n# Work\n\n- [ ] Task\n';
    const out = serializeDailyDocument(parseDailyDocument(custom, '2026-11-03'));
    expect(out).not.toContain('custom_field');
  });
});
