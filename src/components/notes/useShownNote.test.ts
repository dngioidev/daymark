// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { StandaloneNote } from '../../types/daymark';
import { sortNotes } from '../../utils/notes';
import { useShownNote } from './useShownNote';

const note = (id: string, updatedAt = '2026-10-29'): StandaloneNote => ({ id, title: id, folder: '', content: '', tags: [], createdAt: '', updatedAt });
let api: ReturnType<typeof useShownNote>; let root: Root | undefined;
function Harness({ notes }: { notes: StandaloneNote[] }) {
  api = useShownNote(notes, sortNotes(notes)[0]?.id ?? '');
  return React.createElement('output', null, notes.find(note => note.id === api.shownNoteId)?.title ?? 'Empty');
}
function mount(notes: StandaloneNote[]) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); root = createRoot(host);
  act(() => root!.render(React.createElement(Harness, { notes })));
  return { host, update: (notes: StandaloneNote[]) => act(() => root!.render(React.createElement(Harness, { notes }))) };
}
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; vi.unstubAllGlobals(); });
it('adopts the first available note once and replaces it only when removed', () => {
  const { host, update } = mount([]); expect(host.textContent).toBe('Empty');
  update([note('A')]); expect(host.textContent).toBe('A');
  update([note('A'), note('C', '2026-10-30')]); expect(host.textContent).toBe('A');
  update([note('C', '2026-10-30')]); expect(host.textContent).toBe('C');
  update([]); expect(host.textContent).toBe('Empty');
  update([note('D')]); expect(host.textContent).toBe('D');
});
it('keeps an explicitly opened note stable across reorder and replaces it after sync removal', () => {
  const { host, update } = mount([note('A'), note('C', '2026-10-28')]);
  act(() => api.setShownNoteId('C')); expect(host.textContent).toBe('C');
  update([note('A', '2026-10-31'), note('C')]); expect(host.textContent).toBe('C');
  update([note('A')]); expect(host.textContent).toBe('A');
});
