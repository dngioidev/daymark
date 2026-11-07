// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { RelatedPanel, RelatedOverlay, type RelatedPanelProps } from './RelatedPanel';
import { RelatedSheet } from './RelatedSheet';
import type { StandaloneNote } from '../../types/daymark';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const note = (id: string, title = id): StandaloneNote => ({ id, title, content: '', folder: '', tags: [], createdAt: '', updatedAt: '' });
const props: RelatedPanelProps = { suggestions: [{ noteId: 'b', score: 1, sharedTerms: ['java', 'stream'], sharedTags: [], note: note('b') }], possible: [], linked: { outgoing: [note('c')], incoming: [note('d')] }, hidden: [note('e')], onLink: vi.fn(), onDismiss: vi.fn(), onRestore: vi.fn(), onOpen: vi.fn(), minimized: false, onToggleMinimized: vi.fn() };
it('renders shared words, both actions, linked directions, hidden restore and a minimized count', () => {
  const html = renderToStaticMarkup(React.createElement(RelatedPanel, props));
  for (const text of ['shares: java, stream', '>Link<', 'Not related', 'Outgoing', 'Incoming', 'Hidden suggestions', 'Restore']) expect(html).toContain(text);
  const min = renderToStaticMarkup(React.createElement(RelatedPanel, { ...props, minimized: true }));
  expect(min).toContain('Expand Related'); expect(min).toContain('>1<'); expect(min).not.toContain('Not related');
});
it.each(['Java|alias', 'Java]]', 'Java\nstream'])('pressing disabled Link cannot write %s and describes the reason', async title => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); const onLink = vi.fn();
  await act(async () => root.render(React.createElement(RelatedPanel, { ...props, onLink, suggestions: [{ ...props.suggestions[0], note: note('b', title) }] })));
  const link = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Link')!;
  expect(link.disabled).toBe(true);
  expect(document.getElementById(link.getAttribute('aria-describedby')!)?.textContent).toContain('Rename this note');
  await act(async () => link.click()); expect(onLink).not.toHaveBeenCalled();
  await act(async () => root.unmount()); host.remove();
});
it.each([[0, '0 suggestions'], [1, '1 suggestion'], [2, '2 suggestions']])('announces the minimized count: %s', (count, label) => {
  const html = renderToStaticMarkup(React.createElement(RelatedPanel, { ...props, minimized: true, suggestions: Array.from({ length: Number(count) }, () => props.suggestions[0]) }));
  expect(html).toContain(`aria-label="Expand Related, ${label}"`);
});
it('renders None for both empty link directions', () => {
  const html = renderToStaticMarkup(React.createElement(RelatedPanel, { ...props, linked: { outgoing: [], incoming: [] } }));
  expect(html.match(/>None</g)).toHaveLength(2);
});
it('names the surviving strip toggle as Close while its overlay is open', () => {
  const html = renderToStaticMarkup(React.createElement(RelatedPanel, { ...props, minimized: true, overlayOpen: true }));
  expect(html).toContain('aria-label="Close Related, 1 suggestion"');
  expect(html).toContain('aria-expanded="true"');
});
it('opens a sheet with actions, closes and returns focus without editing', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const opener = document.createElement('button'); document.body.append(opener); opener.focus();
  await act(async () => root.render(React.createElement(RelatedSheet, { ...props, isOpen: true, onClose: vi.fn() })));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Hidden suggestions');
  await act(async () => root.unmount()); expect(document.activeElement).toBe(opener);
  host.remove(); opener.remove();
});
it.each(['Escape', 'outside', 'toggle'])('closes the editor overlay on %s and returns focus', async method => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const opener = document.createElement('button'); document.body.append(opener); opener.focus();
  const close = vi.fn();
  function Probe() {
    const [open, setOpen] = React.useState(true);
    return open ? React.createElement(RelatedOverlay, { ...props, onClose: () => { close(); setOpen(false); } }) : null;
  }
  await act(async () => root.render(React.createElement(Probe)));
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => {
    if (method === 'Escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    else if (method === 'outside') document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    else host.querySelector<HTMLButtonElement>('[aria-label="Minimize Related"]')!.click();
  });
  expect(close).toHaveBeenCalledOnce(); expect(document.activeElement).toBe(opener);
  await act(async () => root.unmount()); host.remove(); opener.remove();
});
it('shows Possibly related below Suggested with reasons naming words then #tags', () => {
  const html = renderToStaticMarkup(React.createElement(RelatedPanel, { ...props,
    suggestions: [{ noteId: 'b', score: 0.6, sharedTerms: ['sync', 'conflict'], sharedTags: ['daymark'], note: note('b') }],
    possible: [{ noteId: 'f', score: 0.08, sharedTerms: ['holiday', 'train'], sharedTags: [], note: note('f', 'Trip') }] }));
  expect(html).toContain('shares: sync, conflict, #daymark');
  expect(html).toContain('Possibly related');
  expect(html.indexOf('Possibly related')).toBeGreaterThan(html.indexOf('shares: sync'));
  expect(html).toContain('shares: holiday, train');
  expect(renderToStaticMarkup(React.createElement(RelatedPanel, props))).not.toContain('Possibly related');
});
it('offers Open and Not related but no Link when the open note cannot hold links', () => {
  const html = renderToStaticMarkup(React.createElement(RelatedPanel, { ...props, canLink: false,
    possible: [{ noteId: 'f', score: 0.08, sharedTerms: ['a', 'b'], sharedTags: [], note: note('f') }] }));
  expect(html).not.toContain('>Link<');
  expect(html.match(/Not related/g)).toHaveLength(2);
  expect(renderToStaticMarkup(React.createElement(RelatedPanel, { ...props, suggestions: [], possible: [], canLink: false }))).toContain('No suggestions yet.');
});
