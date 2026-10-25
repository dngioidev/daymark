// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { MarkdownPreview } from '../MarkdownPreview';

const render = vi.hoisted(() => vi.fn());
vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });
it('mermaid render error shows message and source in preview', async () => {
  render.mockRejectedValue(new Error('Invalid diagram syntax'));
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(MarkdownPreview, { content: '```mermaid\nbroken graph\n```' })); });
  await vi.waitFor(() => expect(container.textContent).toContain('Invalid diagram syntax'));
  expect(container.textContent).toContain('broken graph');
  await act(async () => root.unmount());
});
it('sanitises rendered Mermaid SVG in preview', async () => {
  render.mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><text>Safe diagram</text><a href="javascript:alert(1)">bad</a></svg>' });
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(MarkdownPreview, { content: '```mermaid\ngraph TD; A-->B\n```' })); });
  await vi.waitFor(() => expect(container.querySelector('svg text')?.textContent).toBe('Safe diagram'));
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('svg a')?.getAttribute('href')).toBeNull();
  await act(async () => root.unmount());
});
it('keeps Mermaid previews visible through StrictMode effect replay and content replacement', async () => {
  render.mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Rendered</text></svg>' });
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const preview = (content: string) => React.createElement(React.StrictMode, {}, React.createElement(MarkdownPreview, { content }));
  await act(async () => { root.render(preview('```mermaid\ngraph TD; A-->B\n```')); });
  await vi.waitFor(async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); expect(container.querySelector('svg text')?.textContent).toBe('Rendered'); });
  await act(async () => { root.render(preview('Updated\n\n```mermaid\ngraph TD; C-->D\n```')); });
  await vi.waitFor(async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); expect(container.querySelector('svg text')?.textContent).toBe('Rendered'); });
  expect(container.textContent).toContain('Updated');
  await act(async () => root.unmount());
});





it('inserts a starter diagram with its code editor open and reopens it with Enter', async () => {
  const { default: RichNoteEditor } = await import('./RichNoteEditor');
  render.mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Starter diagram</text></svg>' });
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(RichNoteEditor, { noteId: 'diagram-test', markdown: 'Note', onChange: () => {}, onOpenLink: () => {}, notes: [], onCreateNote: () => '' })); });
  await act(async () => { (container.querySelector('[aria-label="Diagram"]') as HTMLButtonElement).click(); });
  expect(container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Mermaid source"]')?.value).toBe('graph TD\n  A[Start] --> B[Finish]');
  await act(async () => { Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Show diagram')!.click(); });
  await act(async () => { container.querySelector('[aria-label="Edit Mermaid diagram"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(container.querySelector('textarea[aria-label="Mermaid source"]')).not.toBeNull();
  await act(async () => root.unmount());
});

it('renders with the current app theme after a theme change', async () => {
  render.mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Themed</text></svg>' });
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(MarkdownPreview, { content: '```mermaid\ngraph TD; A-->B\n```' })); });
  await act(async () => { document.documentElement.classList.add('dark'); });
  await vi.waitFor(async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(render.mock.calls.at(-1)?.[1]).toContain('"theme":"dark"');
  });
  await act(async () => root.unmount());
  document.documentElement.classList.remove('dark');
});
