// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { InkPage } from '../types/daymark';
const state = vi.hoisted(() => ({ saved: [] as InkPage[][] }));
vi.mock('../utils/vaultStore', () => ({ readInkPages: () => [{ noteId: 'study', page: 0, strokes: [], removed: [], updatedAt: 'now' }], saveInkPages: (pages: InkPage[]) => state.saved.push(pages) }));
import { INK_APP_REFRESH_MS, useInkPages } from './useInkPages';

type Api = ReturnType<typeof useInkPages>;
let root: Root, host: HTMLDivElement, api: Api, renders: number;
const page = (noteId: string, n: number, updatedAt: string, removed: string[] = []): InkPage => ({ noteId, page: n, strokes: [], removed, updatedAt });
function Probe() { api = useInkPages(); renders++; return null; }
beforeEach(() => {
  vi.useFakeTimers(); state.saved = []; renders = 0;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div'); root = createRoot(host);
  act(() => root.render(React.createElement(Probe)));
});
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); });

it('starts with hydrated ink and updates just one page while retaining other notes', () => {
  expect(api.inkPagesForNote('study')).toHaveLength(1);
  act(() => api.updateInkPage(page('other', 0, 'now')));
  act(() => api.updateInkPage(page('study', 0, 'later', ['erased'])));
  expect(api.inkStore.get()).toHaveLength(2);
  expect(api.inkPagesForNote('study')[0].removed).toEqual(['erased']);
  expect(state.saved.at(-1)).toEqual(api.inkStore.get());
  act(() => vi.advanceTimersByTime(INK_APP_REFRESH_MS));
  expect(api.ink).toEqual(api.inkStore.get());
});

it('persists every stroke at once but re-renders App only after a writing pause', () => {
  const before = renders;
  for (let i = 1; i <= 5; i++) {
    act(() => api.updateInkPage(page('study', 0, `t${i}`)));
    // Persistence is never delayed: the save sees this stroke's page synchronously.
    expect(state.saved.at(-1)!.find(p => p.noteId === 'study')!.updatedAt).toBe(`t${i}`);
    act(() => vi.advanceTimersByTime(INK_APP_REFRESH_MS - 1));
  }
  expect(renders).toBe(before);
  expect(api.ink[0].updatedAt).toBe('now');
  expect(api.inkPagesForNote('study')[0].updatedAt).toBe('t5');
  act(() => vi.advanceTimersByTime(1));
  expect(renders).toBe(before + 1);
  expect(api.ink[0].updatedAt).toBe('t5');
});

it('shows a new page to App immediately', () => {
  const before = renders;
  act(() => api.updateInkPage(page('study', 1, 'added')));
  expect(renders).toBe(before + 1);
  expect(api.ink.map(p => p.page)).toEqual([0, 1]);
  expect(state.saved.at(-1)).toHaveLength(2);
});

it('setInk applies updaters to the live pages, saves and refreshes App at once', () => {
  act(() => api.updateInkPage(page('study', 0, 'stroke')));
  act(() => api.setInk(current => current.map(p => ({ ...p, removed: ['merged'] }))));
  // The updater saw the stroke App had not rendered yet.
  expect(api.ink[0]).toMatchObject({ updatedAt: 'stroke', removed: ['merged'] });
  expect(state.saved.at(-1)).toBe(api.inkStore.get());
  act(() => vi.advanceTimersByTime(INK_APP_REFRESH_MS * 2));
  expect(api.ink[0].removed).toEqual(['merged']);
});
