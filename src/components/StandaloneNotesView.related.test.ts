// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { StandaloneNotesView } from './StandaloneNotesView';
import { FeedbackHost } from './ui/feedback';
import { EMPTY_NOTE_META, type NoteMeta, type StandaloneNote } from '../types/daymark';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
const notes: StandaloneNote[] = ['a', 'b'].map(id => ({ id, title: `Java ${id}`, content: 'Java stream collectors pipeline', folder: '', tags: [], createdAt: '', updatedAt: '' }));
it('opening Related never saves; Markdown Link edits only the active note; dismiss and Undo update synced metadata', async () => {
  vi.stubGlobal('innerWidth', 900);
  await import('./notes/RichNoteEditor');
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const save = vi.fn(); const metaSave = vi.fn();
  function App() {
    const [value, setValue] = React.useState(notes); const [meta, setMeta] = React.useState<NoteMeta>(EMPTY_NOTE_META);
    return React.createElement(React.Fragment, null, React.createElement(StandaloneNotesView, { notes: value, noteMeta: meta, onUpdateNotes: next => { save(next); setValue(next); }, onUpdateNoteMeta: next => { metaSave(next); setMeta(next); }, openNoteId: 'a' }), React.createElement(FeedbackHost));
  }
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent === text)!;
  await act(async () => root.render(React.createElement(App)));
  await act(async () => new Promise(r => setTimeout(r, 1000)));
  const opener = [...host.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent === 'Related \u00b7 1');
  expect(opener, host.textContent ?? "").toBeDefined();
  opener!.focus();
  await act(async () => opener!.click()); expect(save).not.toHaveBeenCalled();
  await act(async () => { window.innerWidth = 901; window.dispatchEvent(new Event('resize')); });
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => button('Not related').click());
  expect(metaSave.mock.calls.at(-1)![0].dismissed).toEqual([expect.objectContaining({ key: 'a|b', restored: false })]);
  await act(async () => button('Undo').click()); expect(metaSave.mock.calls.at(-1)![0].dismissed[0].restored).toBe(true);
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click());
  expect(document.activeElement).toBe(opener);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Markdown"]')!.click());
  await act(async () => opener!.click()); await act(async () => button('Link').click());
  expect(save.mock.calls.at(-1)![0]).toEqual([expect.objectContaining({ id: 'a', content: notes[0].content + '\n\n## Related\n- [[Java b]]\n' }), notes[1]]);
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
});
