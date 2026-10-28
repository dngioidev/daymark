// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import GraphView from './GraphView';
import { buildNoteIndex } from '../../../utils/noteRelated';
import * as graphLayout from '../../../utils/graphLayout';
import * as graphData from '../../../utils/graphData';
import * as suggestionJobs from '../../../utils/graphSuggestions';
import { graphPerformanceNotes } from '../../../utils/fixtures/graphPerformance';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => vi.restoreAllMocks());
it('coalesces many small scoring batches into at most four progressive graph publications', async () => {
  vi.stubGlobal('innerWidth', 1440); localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  let publish!: (progress: suggestionJobs.SuggestionProgress) => void;
  vi.spyOn(suggestionJobs, 'scheduleGraphSuggestions').mockImplementation((_notes, _index, _dismissed, callback) => { publish = callback; return () => {}; });
  const project = vi.spyOn(graphData, 'buildGraph');
  const notes = graphPerformanceNotes(), host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(GraphView, { notes, index: buildNoteIndex(notes), dismissed: new Set<string>(), folderTree: [], selectedFolder: 'all', onOpenNote: () => {}, onLink: () => {}, onDismiss: () => {} })));
    const before = project.mock.calls.length;
    for (let completed = 50; completed <= 1000; completed += 50) {
      await act(async () => publish({ completed, pending: completed < 1000, batchMs: 12, edges: [{ a: '0', b: '20', kind: 'suggested' }] }));
      if (completed < 250) expect(host.querySelector('canvas')?.getAttribute('aria-label')).toContain('0 notes');
    }
    expect(project.mock.calls.length - before).toBeLessThanOrEqual(4);
    expect(host.querySelector('canvas')?.getAttribute('aria-label')).toContain('2 notes, 1 connections');
    expect(host.textContent).not.toContain('Finding suggestions');
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
it('mounts with canvas, accessible list, reduced motion and no writes; toggles list and minimizes panels', async () => {
  vi.stubGlobal('innerWidth', 1440);
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({}, { get: () => () => {} }) as CanvasRenderingContext2D);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const notes = [{ id: 'a', title: 'Java', folder: '', content: 'Java streams', tags: [], createdAt: '', updatedAt: '' }];
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const link = vi.fn(), dismiss = vi.fn();
  await act(async () => root.render(React.createElement(GraphView, { notes, index: buildNoteIndex(notes), dismissed: new Set<string>(), folderTree: [], selectedFolder: 'all', activeNoteId: 'a', onOpenNote: () => {}, onLink: link, onDismiss: dismiss })));
  expect(host.querySelector('canvas[role="img"]')?.getAttribute('aria-label')).toContain('1 notes');
  expect(host.querySelector('[aria-label="Graph nodes"]')?.textContent).toContain('Java');
  const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  await act(async () => button('List view').click());
  expect(button('List view').getAttribute('aria-pressed')).toBe('true');
  await act(async () => button('Minimize graph filters').click());
  expect(button('Expand graph filters')).not.toBeNull();
  expect(link).not.toHaveBeenCalled(); expect(dismiss).not.toHaveBeenCalled();
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
});
it('search and progressive suggestions never reseed or step the settled layout; hidden list is not a Tab trap; missing Local has an escape', async () => {
  vi.stubGlobal('innerWidth', 1440); localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({}, { get: () => () => {} }) as CanvasRenderingContext2D);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const callbacks = new Map<number, IdleRequestCallback>(); let seq = 0;
  vi.stubGlobal('requestIdleCallback', (cb: IdleRequestCallback) => { callbacks.set(++seq, cb); return seq; });
  vi.stubGlobal('cancelIdleCallback', (id: number) => callbacks.delete(id));
  const makeLayout = vi.spyOn(graphLayout, 'createLayout');
  const notes = ['a', 'b'].map(id => ({ id, title: `Java ${id}`, content: 'Java streams collectors pipeline', folder: 'Tech', tags: [], createdAt: '', updatedAt: '' }));
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(GraphView, { notes, index: buildNoteIndex(notes), dismissed: new Set<string>(), folderTree: [], selectedFolder: 'all', activeNoteId: 'missing', onOpenNote: () => {}, onLink: () => {}, onDismiss: () => {} })));
    expect(host.textContent).toContain('Finding suggestions'); expect(makeLayout).toHaveBeenCalledTimes(1);
    const settle = vi.spyOn(makeLayout.mock.results[0].value, 'settle');
    const positions = [...makeLayout.mock.results[0].value.positions].map(([id, p]: [string, {x: number; y: number}]) => [id, p.x, p.y]);
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Java'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(host.textContent).toContain('2 matching notes'); expect(settle).not.toHaveBeenCalled();
    expect(seq).toBe(1);
    expect(makeLayout).toHaveBeenCalledTimes(1);
    await act(async () => { const [id, callback] = [...callbacks][0]; callbacks.delete(id); callback({ didTimeout: false, timeRemaining: () => 20 }); });
    expect(makeLayout).toHaveBeenCalledTimes(1);
    expect([...makeLayout.mock.results[0].value.positions].map(([id, p]: [string, {x: number; y: number}]) => [id, p.x, p.y])).toEqual(positions);
    expect(host.querySelector('[aria-label="Graph nodes"] button')?.getAttribute('tabindex')).toBe('-1');
    expect(host.querySelector('button[aria-label="Link to Java b"]')).not.toBeNull();
    const local = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')][1];
    await act(async () => local.click()); expect(host.textContent).toContain('Local note is missing or outside these filters');
    const escape = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'Switch to Whole vault')!;
    await act(async () => escape.click()); expect(host.textContent).not.toContain('Local note is missing or outside these filters');
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
it('keeps the previous suggestion edges until the first new publish when notes or dismissed change', async () => {
  vi.stubGlobal('innerWidth', 1440); localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const publishers: Array<(progress: suggestionJobs.SuggestionProgress) => void> = [];
  vi.spyOn(suggestionJobs, 'scheduleGraphSuggestions').mockImplementation((_notes, _index, _dismissed, callback) => { publishers.push(callback); return () => {}; });
  const notes = ['a', 'b', 'c'].map(id => ({ id, title: `Note ${id}`, content: '', folder: '', tags: [], createdAt: '', updatedAt: '' }));
  const host = document.createElement('div'), root = createRoot(host), index = buildNoteIndex(notes);
  const render = (dismissed: Set<string>) => act(async () => root.render(React.createElement(GraphView, { notes, index, dismissed, folderTree: [], selectedFolder: 'all', onOpenNote: () => {}, onLink: () => {}, onDismiss: () => {} })));
  const label = () => host.querySelector('canvas')?.getAttribute('aria-label') ?? '';
  try {
    await render(new Set<string>());
    await act(async () => publishers[0]({ completed: 3, pending: false, batchMs: 1, edges: [{ a: 'a', b: 'b', kind: 'suggested' }] }));
    expect(label()).toContain('3 notes, 1 connections');
    // A new dismissed set restarts scoring; the old edge stays until the new run publishes.
    await render(new Set<string>(['a\u0000c']));
    expect(publishers).toHaveLength(2); expect(label()).toContain('3 notes, 1 connections');
    expect(host.textContent).toContain('Finding suggestions');
    await act(async () => publishers[1]({ completed: 3, pending: false, batchMs: 1, edges: [] }));
    expect(label()).toContain('3 notes, 0 connections'); expect(host.textContent).not.toContain('Finding suggestions');
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
