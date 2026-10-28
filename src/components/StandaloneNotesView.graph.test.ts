// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { StandaloneNotesView } from './StandaloneNotesView';
import { EMPTY_NOTE_META, type StandaloneNote, type NoteMeta } from '../types/daymark';
import { FeedbackHost, dismissToast } from './ui/feedback';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const fixture: StandaloneNote[] = ['a', 'b', 'c'].map((id, i) => ({ id, title: `Java ${id}`, folder: '', content: 'Java streams collectors pipeline', tags: [], createdAt: '', updatedAt: `2026-10-${id === 'c' ? '09' : 10 + i}`, pinned: id === 'c' }));
let cleanup: (() => void) | undefined;
afterEach(async () => { await act(async () => { dismissToast(); cleanup?.(); }); cleanup = undefined; localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each(['detail', 'list'])('Graph replaces panes without saving; %s Link chooses one owner; dismiss supports Undo; phone has no switch', async path => {
  await import('./notes/graph/GraphView');
  vi.stubGlobal('innerWidth', 1440);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), save = vi.fn();
  cleanup = () => { root.unmount(); host.remove(); };
  function App() {
    const [notes, setNotes] = React.useState(fixture), [meta, setMeta] = React.useState<NoteMeta>(EMPTY_NOTE_META);
    return React.createElement(React.Fragment, null, React.createElement(StandaloneNotesView, { notes, noteMeta: meta, onUpdateNoteMeta: setMeta, onUpdateNotes: value => { save(value); setNotes(value); } }), React.createElement(FeedbackHost));
  }
  await act(async () => root.render(React.createElement(App)));
  const click = async (label: string) => { const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label || b.getAttribute('aria-label') === label)!; expect(button, label).toBeTruthy(); await act(async () => button.click()); };
  await click('Graph');
  await vi.waitFor(async () => { await act(async () => {}); expect(host.querySelector('[aria-label="Knowledge graph"]')).not.toBeNull(); }, { timeout: 3000 });
  expect(host.querySelector('[aria-label="Notes navigation"]')).toBeNull();
  expect(save).not.toHaveBeenCalled();
  const scope = path === 'detail' ? '[aria-label="Graph detail"]' : '[aria-label="Graph nodes"]';
  const link = [...host.querySelectorAll<HTMLButtonElement>(scope + ' button')].find(button => button.textContent === 'Link')!;
  await act(async () => link.click());
  const saved = save.mock.lastCall![0] as StandaloneNote[];
  expect(saved.filter((note, i) => note !== fixture[i]).map(note => note.id)).toEqual([path === 'detail' ? 'c' : 'b']);
  expect(saved[path === 'detail' ? 2 : 1].content).toContain('[[Java a]]');
  await click('Not related'); expect(document.body.textContent).toContain('Suggestion hidden.');
  await click('Undo');
  await act(async () => { vi.stubGlobal('innerWidth', 390); window.dispatchEvent(new Event('resize')); });
  expect([...host.querySelectorAll('button')].some(b => b.textContent === 'Graph')).toBe(false);
});
