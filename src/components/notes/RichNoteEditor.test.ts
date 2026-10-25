// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import RichNoteEditor from './RichNoteEditor';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// jsdom has no layout; ProseMirror uses Range geometry when focusing a command.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('unedited note is not re-serialised, including incoming content changes', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  const props = { noteId: 'one', markdown: '#  Original\n\n<!-- untouched -->\n', onChange, onOpenLink: vi.fn(), notes: [], onCreateNote: () => 'new' };
  await act(async () => { root.render(React.createElement(RichNoteEditor, props)); });
  expect(host.querySelector('[contenteditable="true"]')).not.toBeNull();
  await act(async () => { root.render(React.createElement(RichNoteEditor, { ...props, markdown: '# Incoming\n\n' })); });
  expect(host.textContent).toContain('Incoming');
  await act(async () => { root.unmount(); });
  expect(onChange).not.toHaveBeenCalled();
});

it('serialises a formatting edit and preserves unsupported content', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  await act(async () => { root.render(React.createElement(RichNoteEditor, { noteId: 'one', markdown: 'Original\n\n<div>keep me</div>', onChange, onOpenLink: vi.fn(), notes: [], onCreateNote: () => 'new' })); });
  await act(async () => { host.querySelector<HTMLButtonElement>('[aria-label="Bullet list"]')!.click(); });
  expect(onChange).toHaveBeenCalled();
  expect(onChange.mock.calls.at(-1)![0]).toContain('<div>keep me</div>');
  expect(onChange.mock.calls.at(-1)![0]).toContain('- Original');
  await act(async () => { root.unmount(); });
});

it('positions the phone toolbar above the visual viewport and hides it with the editor', async () => {
  const viewport = new EventTarget();
  Object.assign(viewport, { height: 500, offsetTop: 20 });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerWidth', 390);
  vi.stubGlobal('innerHeight', 844);
  // A navigation hidden while typing has a zero rect and must not be treated
  // as covering the whole viewport.
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Main');
  document.body.append(nav);
  let visible = true;
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => (visible ? [new DOMRect(0, 0, 390, 400)] : []) as unknown as DOMRectList);
  let resized: () => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resized = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(RichNoteEditor, { noteId: 'phone', markdown: 'Hello', onChange: vi.fn(), onOpenLink: vi.fn(), notes: [], onCreateNote: () => 'new' })); });
  const toolbar = () => document.querySelector('[role="toolbar"]')?.parentElement?.parentElement;
  expect(toolbar()?.style.bottom).toBe('324px');
  Object.assign(viewport, { height: 450, offsetTop: 30 });
  await act(async () => { viewport.dispatchEvent(new Event('scroll')); });
  expect(toolbar()?.style.bottom).toBe('364px');
  visible = false;
  await act(async () => { resized(); });
  expect(document.body.querySelector('.fixed [role="toolbar"]')).toBeNull();
  visible = true;
  await act(async () => { resized(); });
  expect(toolbar()?.style.bottom).toBe('364px');
  await act(async () => { root.unmount(); });
  expect(disconnect).toHaveBeenCalled();
  expect(document.querySelector('[role="toolbar"]')).toBeNull();
});
