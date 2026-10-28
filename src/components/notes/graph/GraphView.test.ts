// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import GraphView from './GraphView';
import { buildNoteIndex } from '../../../utils/noteRelated';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => vi.restoreAllMocks());
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
