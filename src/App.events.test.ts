import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DailyDocument, EventItem } from './types/daymark';
import type { VaultData } from './sync/syncClient';
import { DEFAULT_SETTINGS } from './utils/defaultData';

const harness = vi.hoisted(() => ({
  docs: [] as DailyDocument[],
  events: [] as EventItem[],
  slots: [] as unknown[],
  index: 0,
  syncChange: undefined as ((next: VaultData) => void) | undefined,
}));

vi.mock('react', async (original) => {
  const actual = await original<typeof React>();
  const next = () => harness.index++;
  const hooks = {
    useState: (initial: unknown) => {
      const index = next();
      if (!(index in harness.slots)) harness.slots[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      const set = (value: unknown) => { harness.slots[index] = typeof value === 'function' ? (value as (current: unknown) => unknown)(harness.slots[index]) : value; };
      return [harness.slots[index], set];
    },
    useRef: (initial: unknown) => {
      const index = next();
      if (!(index in harness.slots)) harness.slots[index] = { current: initial };
      return harness.slots[index];
    },
    useMemo: (fn: () => unknown) => { next(); return fn(); },
    useCallback: (fn: unknown) => { next(); return fn; },
    useEffect: () => { next(); },
  };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});
vi.mock('./utils/vaultStore', async (original) => ({
  ...await original<typeof import('./utils/vaultStore')>(),
  loadDailyDocuments: () => harness.docs, loadEvents: () => harness.events, loadSettings: () => DEFAULT_SETTINGS,
  loadStandaloneNotes: () => [], needsOnboarding: () => false,
}));
vi.mock('./hooks/useAppearance', async () => {
  const { resolveAppearance } = await import('./utils/appearance');
  const { DEFAULT_APPEARANCE } = await import('./utils/defaultData');
  return { useAppearance: () => resolveAppearance(DEFAULT_APPEARANCE, null) };
});
vi.mock('./hooks/useBackgroundPhoto', () => ({ useBackgroundPhoto: () => ({ url: null, meta: null, photos: [], select: vi.fn(), add: vi.fn(), remove: vi.fn() }) }));
vi.mock('./hooks/useRealToday', () => ({ useRealToday: () => '2026-11-15' }));
vi.mock('./hooks/useWidgetSync', () => ({ useWidgetSync: () => {} }));
vi.mock('./native/backButton', () => ({ useBackHandler: vi.fn() }));
vi.mock('./hooks/useSync', () => ({ useSync: (_vault: unknown, onChange: (next: VaultData) => void) => {
  harness.syncChange = onChange;
  return {
    status: 'off', account: null, lastSyncAt: null, error: null, mode: 'local-web', connect: vi.fn(), disconnect: vi.fn(),
    signOut: vi.fn(), pendingChanges: () => 0, authFetch: vi.fn(), syncNow: vi.fn(), rebaseAfterReplace: vi.fn(),
  };
} }));
vi.mock('./hooks/useInkPages', () => ({ useInkPages: () => ({ ink: [], setInk: vi.fn(), inkPagesForNote: () => [], updateInkPage: vi.fn(), inkStore: {} }) }));

import App from './App';
import { TodayView } from './components/TodayView';
import { EventEditor } from './components/events/EventEditor';
import { MobileAppShell } from './components/mobile/MobileAppShell';
import { useBackHandler } from './native/backButton';

function findElement<T>(node: React.ReactNode, type: React.ComponentType<T>): React.ReactElement<T> | undefined {
  if (Array.isArray(node)) return node.map(child => findElement(child, type)).find(Boolean);
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return;
  if (node.type === type) return node as React.ReactElement<T>;
  return findElement(node.props.children, type);
}

function renderApp() { harness.index = 0; return App(); }

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); harness.slots.length = 0; harness.docs.length = 0; harness.events.length = 0; harness.index = 0; });

it('stamps an inline event checklist update with the local edit time', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-16T10:15:00.000Z'));
  vi.stubGlobal('window', { innerWidth: 1440, location: { search: '' } });
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('localStorage', { getItem: () => null });
  const event: EventItem = { id: 'event-checklist-time', title: 'Pack', date: '2026-11-16', heading: 'Work', order: 1,
    checklist: [{ id: 'item-1', text: 'Agenda', done: false }], createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };
  harness.events.push(event);
  const today = findElement(renderApp(), TodayView)!.props;

  today.onUpdateEvent!({ ...event, checklist: [{ id: 'item-1', text: 'Agenda', done: true }] }, event);

  const finalToday = findElement(renderApp(), TodayView)!.props;
  expect(finalToday.events).toEqual([expect.objectContaining({ updatedAt: '2026-11-16T10:15:00.000Z', checklist: [{ id: 'item-1', text: 'Agenda', done: true }] })]);
});

it('passes the live event collection, current zone and callbacks into mobile mode', () => {
  vi.stubGlobal('window', { innerWidth: 412, location: { search: '' } });
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('localStorage', { getItem: () => null });
  const event: EventItem = { id: 'event-phone', title: 'Phone appointment', date: '2026-11-15', heading: 'Work', order: 1,
    createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };
  harness.events.push(event);

  const shell = findElement(renderApp(), MobileAppShell)!;

  expect(shell.props).toMatchObject({ events: [event], deviceZone: expect.any(String),
    onEditEvent: expect.any(Function), onUpdateEvent: expect.any(Function), onDeleteEvent: expect.any(Function), onMoveEvent: expect.any(Function) });
});

it('does not replace a newer synced event title and notes with a stale checklist candidate', () => {
  vi.stubGlobal('window', { innerWidth: 1440, location: { search: '' } });
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('localStorage', { getItem: () => null });
  const base: EventItem = { id: 'event-checklist-race', title: 'Planning', date: '2026-11-15', heading: 'Work', order: 1,
    description: 'Base notes', checklist: [{ id: 'one', text: 'Bring slides', done: false }],
    createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };
  harness.events.push(base);
  const oldToday = findElement(renderApp(), TodayView)!.props;
  const staleChecklistUpdate = oldToday.onUpdateEvent!;
  const remote: EventItem = { ...base, title: 'Remote planning', description: 'Remote notes', updatedAt: '2026-11-02T10:00:00.000Z' };
  harness.syncChange!({ docs: [], notes: [], events: [remote], settings: DEFAULT_SETTINGS, habits: { habits: [], days: [] }, backlog: { items: [] }, notemeta: { folders: [], dismissed: [] }, ink: [] });

  staleChecklistUpdate({ ...base, checklist: [{ id: 'one', text: 'Bring slides', done: true }] }, base);

  expect(findElement(renderApp(), TodayView)!.props.events).toEqual([expect.objectContaining({
    title: 'Remote planning', description: 'Remote notes', checklist: [{ id: 'one', text: 'Bring slides', done: true }],
  })]);
});

it('merges an edit against an event update received after the editor callback was captured', () => {
  vi.stubGlobal('window', { innerWidth: 1440, location: { search: '' } });
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('localStorage', { getItem: () => null });
  const base: EventItem = { id: 'event-race', title: 'Planning', date: '2026-11-15', heading: 'Work', order: 1,
    description: 'Base note', createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };
  harness.events.splice(0, harness.events.length, base);
  const firstTree = renderApp();
  const firstToday = findElement(firstTree, TodayView)!.props;
  firstToday.onEditEvent!(base);
  const editorTree = renderApp();
  const staleSave = findElement(editorTree, EventEditor)!.props.onSave;

  const remote = { ...base, description: 'Remote note', updatedAt: '2026-11-02T10:00:00.000Z' };
  firstToday.onUpdateEvent!(remote);
  staleSave({ ...base, title: 'Local title', updatedAt: '2026-11-03T10:00:00.000Z' }, base);

  const finalToday = findElement(renderApp(), TodayView)!.props;
  expect(finalToday.events).toEqual([expect.objectContaining({ title: 'Local title', description: 'Remote note' })]);
});

it('handles Android Back by closing the event editor before navigation', () => {
  vi.stubGlobal('window', { innerWidth: 1440, location: { search: '' } });
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('localStorage', { getItem: () => null });
  const event: EventItem = { id: 'event-back', title: 'Planning', date: '2026-11-15', heading: 'Work', order: 1,
    createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' };
  harness.events.push(event);
  findElement(renderApp(), TodayView)!.props.onEditEvent!(event);
  const tree = renderApp();
  expect(findElement(tree, EventEditor)).toBeDefined();
  const handler = vi.mocked(useBackHandler).mock.calls.at(-1)![0];
  expect(handler()).toBe(true);
  expect(findElement(renderApp(), EventEditor)).toBeUndefined();
});
