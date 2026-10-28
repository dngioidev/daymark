// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useRelatedNotes } from './useRelatedNotes';
import type { DismissedPair, StandaloneNote } from '../types/daymark';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const note = (id: string, content = 'Java stream collectors pipeline'): StandaloneNote => ({ id, title: `Java ${id}`, content, folder: '', tags: [], createdAt: '', updatedAt: '' });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('computes at idle after 800ms, retains suggestions while editing, excludes linked and dismissed pairs, restores hidden pairs', async () => {
  vi.useFakeTimers();
  const idle = vi.fn((cb: () => void) => window.setTimeout(cb, 1));
  vi.stubGlobal('requestIdleCallback', idle); vi.stubGlobal('cancelIdleCallback', window.clearTimeout);
  const host = document.createElement('div'); const root = createRoot(host);
  let result!: ReturnType<typeof useRelatedNotes>;
  function Probe({ notes, dismissed = [] }: { notes: StandaloneNote[]; dismissed?: DismissedPair[] }) { result = useRelatedNotes(notes, 'a', dismissed); return null; }
  const notes = [note('a'), note('b')];
  await act(async () => root.render(React.createElement(Probe, { notes })));
  await act(async () => vi.advanceTimersByTime(799)); expect(idle).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(2)); expect(result.suggestions.map(s => s.noteId)).toEqual(['b']);
  await act(async () => root.render(React.createElement(Probe, { notes: [note('a', 'Java stream collectors pipeline\n\n[[Java b]]'), notes[1]] })));
  expect(result.suggestions).toHaveLength(1);
  await act(async () => vi.advanceTimersByTime(801)); expect(result.suggestions).toEqual([]); expect(result.linked.outgoing[0].id).toBe('b');
  await act(async () => root.render(React.createElement(Probe, { notes, dismissed: [{ key: 'a|b', at: 'now' }] })));
  await act(async () => vi.advanceTimersByTime(801)); expect(result.suggestions).toEqual([]); expect(result.hidden[0].id).toBe('b');
  await act(async () => root.render(React.createElement(Probe, { notes, dismissed: [{ key: 'a|b', at: 'later', restored: true }] })));
  expect(result.suggestions).toHaveLength(1); expect(result.hidden).toEqual([]);
  idle.mockClear();
  await act(async () => result.refresh());
  expect(result.suggestions).toHaveLength(1);
  await act(async () => vi.advanceTimersByTime(801));
  expect(idle).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});
it('schedules no index rebuild while disabled (the knowledge graph replaces the Related panel)', async () => {
  vi.useFakeTimers();
  const idle = vi.fn((cb: () => void) => window.setTimeout(cb, 1));
  vi.stubGlobal('requestIdleCallback', idle); vi.stubGlobal('cancelIdleCallback', window.clearTimeout);
  const host = document.createElement('div'); const root = createRoot(host);
  let result!: ReturnType<typeof useRelatedNotes>;
  function Probe({ enabled }: { enabled: boolean }) { result = useRelatedNotes(notes, 'a', [], enabled); return null; }
  const notes = [note('a'), note('b')];
  await act(async () => root.render(React.createElement(Probe, { enabled: false })));
  await act(async () => vi.advanceTimersByTime(2000)); expect(idle).not.toHaveBeenCalled(); expect(result.suggestions).toEqual([]);
  await act(async () => root.render(React.createElement(Probe, { enabled: true })));
  await act(async () => vi.advanceTimersByTime(801)); expect(result.suggestions.map(s => s.noteId)).toEqual(['b']);
  await act(async () => root.unmount());
});
