// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { encodePoints } from '../ink/inkModel';
import type { InkPage } from '../types/daymark';
import { DEFAULT_SETTINGS } from './defaultData';
import { canonicalJson } from './canonicalJson';
import * as canonical from './canonicalJson';
import { applySyncOutcome, collectChanges, toEntities, type SyncOutcome, type SyncState, type VaultData } from '../sync/syncClient';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const median = (samples: number[]) => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];

it('one-page save and sync stay below 15ms median in a 50-page study vault', async () => {
  const pages: InkPage[] = Array.from({ length: 50 }, (_, page) => ({ noteId: 'study', page, removed: [], updatedAt: '2026-11-01',
    strokes: Array.from({ length: 300 }, (_, s) => ({ id: `p${page}-s${s}`, tool: 'pen', color: '#292524', width: 2, createdAt: '2026-11-01',
      points: encodePoints(Array.from({ length: 60 }, (_, p) => ({ x: s % 20 * 45 + p / 2, y: Math.floor(s / 20) * 80 + Math.sin(p) * 5, p: 0.5 + p % 7 / 100 }))) })) }));
  const raw = new Map<string, unknown>([['ink', pages]]), values = new Map<string, string>();
  const puts: string[] = [], posts: unknown[] = [];
  vi.stubGlobal('localStorage', { get length() { return values.size; }, key: (i: number) => [...values.keys()][i], getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
  vi.stubGlobal('BroadcastChannel', class { postMessage(data: unknown) { posts.push(structuredClone(data)); } });
  const database = { close() {}, transaction: (_: string, mode: string) => ({
    objectStore: () => ({
      put: (value: unknown, key: string) => { puts.push(key); raw.set(key, structuredClone(value)); },
      delete: (key: string) => raw.delete(key),
      openCursor: () => {
        const entries = [...raw]; let i = 0;
        const req = { result: null as unknown, onsuccess() {} };
        const next = () => queueMicrotask(() => { const entry = entries[i++]; req.result = entry ? { key: entry[0], value: entry[1], continue: next } : null; req.onsuccess(); }); next(); return req;
      },
    }),
    set oncomplete(fn: () => void) { if (mode === 'readwrite') queueMicrotask(fn); },
  }) };
  vi.stubGlobal('indexedDB', { open: () => { const req = { result: database, onsuccess() {} }; queueMicrotask(() => req.onsuccess()); return req; } });
  vi.stubGlobal('navigator', {});
  const win = new EventTarget(); vi.stubGlobal('window', win);
  vi.resetModules(); const store = await import('./vaultStore'); await store.initVaultStore();
  const local: VaultData = { ink: pages, docs: [], notes: [], settings: DEFAULT_SETTINGS, habits: { habits: [], days: [] }, backlog: { items: [] }, notemeta: { folders: [], dismissed: [] } };
  const state: SyncState = { serverUrl: '', username: '', deviceId: '', deviceName: '', lastRev: 1, lastSyncAt: null,
    bases: Object.fromEntries([...toEntities(local)].map(([key, value]) => [key, canonicalJson(value)])) };
  collectChanges(toEntities(local), state); // Warm version metadata once, as on startup.
  const calls = vi.spyOn(canonical, 'canonicalJson');
  const saveTimes: number[] = [], syncTimes: number[] = [], touched: number[] = [], canonicalPages: number[] = [];
  for (let i = 0; i < 20; i++) {
    const changed = { ...pages[7], updatedAt: `edit-${i}`, strokes: [...pages[7].strokes, { ...pages[7].strokes[0], id: `new-${i}` }] };
    const current = { ...local, ink: pages.map(p => p.page === 7 ? changed : p) };
    puts.length = 0; posts.length = 0;
    const start = performance.now();
    store.saveInkPages(current.ink); win.dispatchEvent(new Event('pagehide'));
    // Drain the real promise queue, including the IndexedDB structured clone and commit.
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    saveTimes.push(performance.now() - start);
    touched.push(puts.filter(key => key === 'ink' || key.startsWith('ink:')).length === 1 && puts[0] === 'ink:study:7' ? 1 : 0);
    calls.mockClear();
    const begin = performance.now();
    const changes = collectChanges(toEntities(current), state);
    const outcome: SyncOutcome = { unsupported: new Set(), backlogRecovered: false, notemetaRecovered: false, habitsRecovered: false,
      snapshot: toEntities(local), serverValues: new Map([['ink:study:7', changed]]), state, conflicts: [], pushed: 0, received: 1 };
    const applied = applySyncOutcome(local, outcome);
    syncTimes.push(performance.now() - begin);
    canonicalPages.push(calls.mock.calls.filter(([value]) => !!value && typeof value === 'object' && 'noteId' in value).length);
    expect(changes.map(c => c.key)).toEqual(['ink:study:7']);
    expect(applied.ink[0]).toBe(pages[0]);
  }
  console.info(`50-page ink (${JSON.stringify(pages).length} bytes): save median=${median(saveTimes).toFixed(3)}ms, collect+apply median=${median(syncTimes).toFixed(3)}ms; IDB page-only runs=${touched.reduce((a,b) => a+b,0)}/20, max canonical page calls=${Math.max(...canonicalPages)}`);
  expect(median(saveTimes)).toBeLessThan(15);
  expect(median(syncTimes)).toBeLessThan(15);
  expect(touched).toEqual(Array(20).fill(1));
  expect(Math.max(...canonicalPages)).toBe(1);
});
