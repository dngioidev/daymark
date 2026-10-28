// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { RelatedPanel, type RelatedPanelProps } from './RelatedPanel';
import { RelatedSheet } from './RelatedSheet';
import type { StandaloneNote } from '../../types/daymark';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const note = (id: string, title = id): StandaloneNote => ({ id, title, content: '', folder: '', tags: [], createdAt: '', updatedAt: '' });
const props: RelatedPanelProps = { suggestions: [{ noteId: 'b', score: 1, sharedTerms: ['java', 'stream'], note: note('b') }], linked: { outgoing: [note('c')], incoming: [note('d')] }, hidden: [note('e')], onLink: vi.fn(), onDismiss: vi.fn(), onRestore: vi.fn(), onOpen: vi.fn(), minimized: false, onToggleMinimized: vi.fn() };
it('renders shared words, both actions, linked directions, hidden restore and a minimized count', () => {
  const html = renderToStaticMarkup(React.createElement(RelatedPanel, props));
  for (const text of ['shares: java, stream', '>Link<', 'Not related', 'Outgoing', 'Incoming', 'Hidden suggestions', 'Restore']) expect(html).toContain(text);
  const min = renderToStaticMarkup(React.createElement(RelatedPanel, { ...props, minimized: true }));
  expect(min).toContain('Expand Related'); expect(min).toContain('>1<'); expect(min).not.toContain('Not related');
});
it('disables Link with an explanation for unsafe titles', () => {
  const html = renderToStaticMarkup(React.createElement(RelatedPanel, { ...props, suggestions: [{ ...props.suggestions[0], note: note('b', 'Java|alias') }] }));
  expect(html).toContain('disabled'); expect(html).toContain('Rename this note');
});
it('opens a sheet with actions, closes and returns focus without editing', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const opener = document.createElement('button'); document.body.append(opener); opener.focus();
  await act(async () => root.render(React.createElement(RelatedSheet, { ...props, isOpen: true, onClose: vi.fn() })));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Hidden suggestions');
  expect(props.onLink).not.toHaveBeenCalled();
  await act(async () => root.unmount()); expect(document.activeElement).toBe(opener);
  host.remove(); opener.remove();
});
