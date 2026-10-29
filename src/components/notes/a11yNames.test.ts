// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import axe from 'axe-core';
import { expect, it, vi } from 'vitest';
import { NoteNavigation } from './NoteNavigation';
import { RelatedPanel, type RelatedPanelProps } from './RelatedPanel';
import { GraphFilters } from './graph/GraphFilters';
import GraphView from './graph/GraphView';
import { buildNoteIndex } from '../../utils/noteRelated';
import type { StandaloneNote } from '../../types/daymark';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const note = (id: string, folder = ''): StandaloneNote => ({ id, title: id, content: '', folder, tags: ['t'], createdAt: '', updatedAt: '' });
const tree = [{ path: 'Tech', name: 'Tech', ownCount: 1, totalCount: 3, children: [{ path: 'Tech/Java', name: 'Java', ownCount: 2, totalCount: 2, children: [] }] }];
const related: RelatedPanelProps = { suggestions: [{ noteId: 'b', score: 1, sharedTerms: ['java'], note: note('b') }], linked: { outgoing: [note('c')], incoming: [] }, hidden: [note('e')], onLink: vi.fn(), onDismiss: vi.fn(), onRestore: vi.fn(), onOpen: vi.fn(), minimized: false, onToggleMinimized: vi.fn() };
async function violations(element: React.ReactElement) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(element));
    // jsdom has no layout, so axe reports label-content-name-mismatch as
    // "incomplete" there; apply the same WCAG 2.5.3 rule directly. The browser
    // suites (QA and UX) run the real axe rule on the same components.
    const squash = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const mismatches = [...host.querySelectorAll<HTMLElement>('button[aria-label], a[aria-label], input[aria-label]')]
      .filter(el => !el.matches('input') && squash(el.textContent ?? '') && !squash(el.getAttribute('aria-label')!).includes(squash(el.textContent ?? '')))
      .map(el => `label-content-name-mismatch: ${el.outerHTML.slice(0, 160)}`);
    const result = await axe.run(host, { runOnly: { type: 'rule', values: ['button-name', 'label'] } });
    return [...mismatches, ...result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.html).join(' | ')}`)];
  } finally { await act(async () => root.unmount()); host.remove(); }
}
it.each([false, true])('note navigation accessible names contain visible text (compact=%s)', async compact => {
  expect(await violations(React.createElement(NoteNavigation, {
    notes: [note('Java note', 'Tech/Java')], meta: { folders: [], dismissed: [] }, currentFolder: 'Tech/Java',
    expanded: new Set(['tech', 'tech/java']), query: '', openNoteId: 'Java note', compact, dragEnabled: !compact,
    onExpandedChange: vi.fn(), onQueryChange: vi.fn(), onOpenNote: vi.fn(), onSelectFolder: vi.fn(),
    onNewNote: vi.fn(), onNewFolder: vi.fn(), onFolderAction: vi.fn(),
  }))).toEqual([]);
});
it.each([false, true])('Related toggle names contain their visible text (minimized=%s, empty=%s)', async minimized => {
  expect(await violations(React.createElement(RelatedPanel, { ...related, minimized }))).toEqual([]);
  expect(await violations(React.createElement(RelatedPanel, { ...related, minimized, suggestions: [] }))).toEqual([]);
});
it('graph filters and toolbar names contain their visible text', async () => {
  const options = { folderPaths: null, showSuggestions: true, showTags: false, showOrphans: true };
  expect(await violations(React.createElement(GraphFilters, { tree, tags: ['t'], options, onChange: vi.fn() }))).toEqual([]);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const notes = [note('a', 'Tech'), note('b', 'Tech/Java')];
  expect(await violations(React.createElement(GraphView, { notes, index: buildNoteIndex(notes), dismissed: new Set<string>(), folderTree: tree, selectedFolder: 'all', onOpenNote: () => {}, onLink: () => {}, onDismiss: () => {} }))).toEqual([]);
  vi.restoreAllMocks();
});
