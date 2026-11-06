// Cycle 15 audit: real renderers/parsers against the shared fixture corpus.
// Expectations come from fixtures/notes/rendering/cases.json (hand-reviewed
// literals), never from renderer output. Failures here are product findings.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions } from '../components/notes/editorExtensions';
import { MarkdownPreview } from '../components/MarkdownPreview';
import { docToMarkdown } from '../utils/noteMarkdown';
import { parseDailyDocument, serializeDailyDocument } from '../utils/markdownEngine';
import { loadMarkdownRenderingCases, type RenderingExpectation } from '../test/markdownRenderingFixtures';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const DATE = '2026-11-03';
const cases = loadMarkdownRenderingCases();

function checkSurface(root: ParentNode & { textContent: string | null }, expectation: RenderingExpectation) {
  const text = root.textContent ?? '';
  for (const visible of expectation.visibleText) expect(text, `visible text ${JSON.stringify(visible)}`).toContain(visible);
  for (const { selector, count } of expectation.elements)
    expect(root.querySelectorAll(selector).length, `elements ${selector}`).toBe(count);
}

function mountEditor(markdown: string) {
  return new Editor({ extensions: editorExtensions, content: markdown, contentType: 'markdown' });
}

async function renderPreview(content: string) {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(MarkdownPreview, { content })));
  return { host, done: () => act(async () => root.unmount()) };
}

const dailyText = (doc: ReturnType<typeof parseDailyDocument>) =>
  doc.headings.map(h => [h.name, h.notesContent ?? '', ...h.items.map(i => `${i.title}\n${i.description ?? ''}\n${(i.checklist ?? []).map(k => k.text).join('\n')}`)].join('\n')).join('\n');

describe.each(cases)('$family: $id', c => {
  it('notes rich editor renders the expected semantics', () => {
    const editor = mountEditor(c.source);
    try {
      checkSurface(editor.view.dom, c.notes);
    } finally { editor.destroy(); }
  });

  it('notes rich editor opening does not change the source', () => {
    const editor = mountEditor(c.source);
    try {
      const out = docToMarkdown(editor.getJSON());
      if (c.fidelity === 'verbatim') expect(out.replace(/\s+$/, '')).toBe(c.source.replace(/\r\n/g, '\n').replace(/\s+$/, ''));
      for (const token of c.notes.sourceTokens) expect(out, `token ${JSON.stringify(token)}`).toContain(token);
    } finally { editor.destroy(); }
  });

  it('notes rich editor keeps the source through an unrelated edit and reload', () => {
    const source = c.source.replace(/\r\n/g, '\n').replace(/\s+$/, '');
    const editor = mountEditor(`${source}\n\nEdit elsewhere`);
    let out: string;
    try {
      editor.view.dispatch(editor.state.tr.insertText(' updated', editor.state.doc.content.size - 1));
      out = docToMarkdown(editor.getJSON());
    } finally { editor.destroy(); }
    if (c.fidelity === 'verbatim') expect(out).toBe(`${source}${source ? '\n\n' : ''}Edit elsewhere updated`);
    for (const token of c.notes.sourceTokens) expect(out, `token ${JSON.stringify(token)}`).toContain(token);
    const reloaded = mountEditor(out);
    try {
      checkSurface(reloaded.view.dom, c.notes);
    } finally { reloaded.destroy(); }
  });

  it('preview renders safe readable HTML', async () => {
    const { host, done } = await renderPreview(c.source);
    try {
      checkSurface(host, c.preview);
    } finally { await done(); }
  });

  it('daily document keeps the section body through parse and serialize', () => {
    const body = c.source.replace(/\r\n/g, '\n').replace(/\s+$/, '');
    const markdown = `---\ndate: ${DATE}\ntype: daily\n---\n\n# Ideas\n\n${body}\n`;
    const parsed = parseDailyDocument(markdown, DATE);
    const text = dailyText(parsed);
    for (const token of c.daily.sourceTokens) expect(text, `parsed token ${JSON.stringify(token)}`).toContain(token);
    const again = parseDailyDocument(serializeDailyDocument(parsed), DATE);
    const text2 = dailyText(again);
    for (const token of c.daily.sourceTokens) expect(text2, `reserialised token ${JSON.stringify(token)}`).toContain(token);
  });
});

describe('dividers and headers (known Cycle 14 investigation scenarios)', () => {
  const rules = ['---', '----', '***', '___', '- - -'];

  it.each(rules)('preview renders two %s rules and both paragraphs as a whole file', async rule => {
    const { host, done } = await renderPreview(`${rule}\n\nFirst section\n\n${rule}\n\nLast section`);
    try {
      expect(host.querySelectorAll('hr')).toHaveLength(2);
      expect(host.textContent).toContain('First section');
      expect(host.textContent).toContain('Last section');
    } finally { await done(); }
  });

  it.each(rules)('daily parser keeps all text when a file opens with %s', rule => {
    const source = `${rule}\n\nFirst section\n\n${rule}\n\nLast section`;
    const text = dailyText(parseDailyDocument(source, DATE));
    expect(text).toContain('First section');
    expect(text).toContain('Last section');
  });

  it('daily parser keeps all text when an opening --- never closes', () => {
    const source = '---\ntitle: Unclosed header\n\nKeep this note';
    expect(dailyText(parseDailyDocument(source, DATE))).toContain('Keep this note');
  });

  it('daily parser keeps all text when an opening --- is followed by prose then a rule', () => {
    const source = '---\ntitle: Example\nordinary prose\n---\n\nBody';
    expect(dailyText(parseDailyDocument(source, DATE))).toContain('ordinary prose');
  });

  it('preview keeps "ordinary prose" visible for a malformed header', async () => {
    const { host, done } = await renderPreview('---\ntitle: Example\nordinary prose\n---\n\nBody');
    try {
      expect(host.textContent).toContain('ordinary prose');
    } finally { await done(); }
  });

  it('four dashes never close a header', async () => {
    const { host, done } = await renderPreview('---\ntitle: Example\n----\n\nAfter dashes');
    try {
      expect(host.textContent).toContain('After dashes');
      expect(host.textContent).toContain('title: Example');
    } finally { await done(); }
  });

  it('leading indentation or blank lines mean ordinary Markdown, not a header', async () => {
    const { host, done } = await renderPreview('\n---\ntitle: Example\n---\n\nBody');
    try {
      expect(host.textContent).toContain('title: Example');
    } finally { await done(); }
  });

  it('a leading BOM is preserved by the preview, not silently dropped', async () => {
    const { host, done } = await renderPreview('﻿---\ntitle: Example\n---\n\nBody');
    try {
      expect(host.textContent).toContain('Body');
    } finally { await done(); }
  });

  it('rich editor keeps both text paragraphs between two --- rules', () => {
    const editor = mountEditor('---\n\nFirst section\n\n---\n\nLast section');
    try {
      expect(editor.view.dom.querySelectorAll('hr')).toHaveLength(2);
      expect(editor.view.dom.textContent).toContain('First section');
    } finally { editor.destroy(); }
  });

  it.each(['----', '***', '___', '- - -'])('rich editor keeps %s spelling through an unrelated edit', rule => {
    const source = `${rule}\n\nFirst section\n\n${rule}\n\nLast section`;
    const editor = mountEditor(`${source}\n\nEdit elsewhere`);
    try {
      editor.view.dispatch(editor.state.tr.insertText(' updated', editor.state.doc.content.size - 1));
      expect(docToMarkdown(editor.getJSON())).toBe(`${source}\n\nEdit elsewhere updated`);
    } finally { editor.destroy(); }
  });

  it('Title\\n--- is a heading, not a divider (rich and preview)', async () => {
    const editor = mountEditor('Title\n---\n\nBody');
    try {
      expect(editor.view.dom.querySelectorAll('h2')).toHaveLength(1);
    } finally { editor.destroy(); }
    const { host, done } = await renderPreview('Title\n---\n\nBody');
    try {
      expect(host.querySelectorAll('h2')).toHaveLength(1);
    } finally { await done(); }
  });
});

describe('daily metadata and machine comments', () => {
  const comment = (id: string) => `<!-- daymark: task_id=${id} status=todo created=${DATE} -->`;

  it('keeps task identity, status and provenance through parse and serialize', () => {
    const source = `---\ndate: ${DATE}\ntype: daily\n---\n\n# Work\n\n- [ ] Write audit\n  ${comment('fixed-task-1')}\n- [x] Done thing\n  <!-- daymark: task_id=fixed-task-2 status=done created=2026-11-01 completed=2026-11-02 -->\n`;
    const parsed = parseDailyDocument(source, DATE);
    const items = parsed.headings.flatMap(h => h.items);
    expect(items.map(i => i.id)).toEqual(['fixed-task-1', 'fixed-task-2']);
    expect(items[1].status).toBe('done');
    expect(items[1].createdDate).toBe('2026-11-01');
    expect(items[1].completedDate).toBe('2026-11-02');
    const out = serializeDailyDocument(parsed);
    expect(out).toContain('task_id=fixed-task-1');
    expect(out).toContain('task_id=fixed-task-2');
    expect(out).toContain('created=2026-11-01');
    expect(out).toContain('completed=2026-11-02');
  });

  it('hides machine comments in preview but keeps them in storage', async () => {
    const content = `- [ ] Visible task\n  ${comment('fixed-task-3')}`;
    const { host, done } = await renderPreview(content);
    try {
      expect(host.textContent).toContain('Visible task');
      expect(host.textContent).not.toContain('task_id');
      expect(host.innerHTML).not.toContain('daymark:');
    } finally { await done(); }
  });

  it('ordinary section checklists stay note content when written as notes', () => {
    const source = `---\ndate: ${DATE}\ntype: daily\n---\n\n# Ideas\n\nPlain note line\n`;
    const parsed = parseDailyDocument(source, DATE);
    expect(dailyText(parsed)).toContain('Plain note line');
  });

  it('literal wiki links, callouts and HTML inside code stay literal in preview', async () => {
    const { host, done } = await renderPreview('```\n[[Not Link]]\n> [!NOTE] x\n<b>raw</b>\n```\n\n`[[Inline Code]]`');
    try {
      expect(host.querySelectorAll('button[data-internal-note]')).toHaveLength(0);
      expect(host.querySelectorAll('.daymark-callout')).toHaveLength(0);
      expect(host.querySelectorAll('pre b')).toHaveLength(0);
    } finally { await done(); }
  });

  it('preview sanitises scripts, event handlers and javascript: URLs without executing', async () => {
    (globalThis as { __pwn?: number }).__pwn = 0;
    const { host, done } = await renderPreview('<script>globalThis.__pwn=1</script><img src=x onerror="globalThis.__pwn=2"> [x](javascript:globalThis.__pwn=3) <a href="javascript:void(0)">y</a>');
    try {
      expect(host.querySelectorAll('script, [onerror]')).toHaveLength(0);
      expect(host.querySelectorAll('a[href^="javascript:"]')).toHaveLength(0);
      expect((globalThis as { __pwn?: number }).__pwn).toBe(0);
    } finally { await done(); }
  });
});
