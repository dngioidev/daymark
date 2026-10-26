import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DailyDocument } from './types/daymark';
import { DEFAULT_SETTINGS } from './utils/defaultData';

const { docs, toast, setState } = vi.hoisted(() => ({ docs: [] as DailyDocument[], toast: vi.fn(), setState: vi.fn() }));
vi.mock('react', async (original) => {
  const actual = await original<typeof React>();
  const hooks = {
    useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, setState],
    useEffect: () => {}, useMemo: (fn: () => unknown) => fn(), useRef: (current: unknown) => ({ current }),
  };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});
vi.mock('./utils/vaultStore', async (original) => ({
  ...await original<typeof import('./utils/vaultStore')>(),
  loadDailyDocuments: () => docs, loadSettings: () => DEFAULT_SETTINGS,
  loadStandaloneNotes: () => [], needsOnboarding: () => false,
}));
vi.mock('./hooks/useAppearance', async () => {
  const { resolveAppearance } = await import('./utils/appearance');
  const { DEFAULT_APPEARANCE } = await import('./utils/defaultData');
  return { useAppearance: () => resolveAppearance(DEFAULT_APPEARANCE, null) };
});
vi.mock('./hooks/useBackgroundPhoto', () => ({ useBackgroundPhoto: () => ({ url: null, meta: null, photos: [], select: vi.fn(), add: vi.fn(), remove: vi.fn() }) }));
vi.mock('./hooks/useRealToday', () => ({ useRealToday: () => '2026-10-21' }));
vi.mock('./hooks/useWidgetSync', () => ({ useWidgetSync: () => {} }));
vi.mock('./native/backButton', () => ({ useBackHandler: () => {} }));
vi.mock('./hooks/useSync', () => ({ useSync: () => ({
  status: 'off', account: null, lastSyncAt: null, error: null, mode: 'local-web',
  connect: vi.fn(), disconnect: vi.fn(), signOut: vi.fn(), pendingChanges: () => 0,
  authFetch: vi.fn(), syncNow: vi.fn(), rebaseAfterReplace: vi.fn(),
}) }));
vi.mock('./components/ui/feedback', async (original) => ({ ...await original<typeof import('./components/ui/feedback')>(), showToast: toast }));
import App from './App';
import { TodayView } from './components/TodayView';

function findToday(node: React.ReactNode): React.ComponentProps<typeof TodayView> | undefined {
  if (Array.isArray(node)) return node.map(findToday).find(Boolean);
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return;
  if (node.type === TodayView) return node.props as React.ComponentProps<typeof TodayView>;
  return findToday(node.props.children);
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('reports a duplicate destination without changing the vault or offering Undo', () => {
  vi.stubGlobal('window', { innerWidth: 1440, location: { search: '' } });
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('localStorage', { getItem: () => null });
  const task = { id: 'same', title: 'Prepare', status: 'not-started', createdDate: '2026-10-21', originalNoteDate: '2026-10-21', heading: 'Work', order: 0, historyLog: [] };
  docs.splice(0, docs.length, ...['2026-10-21', '2026-10-22'].map((date): DailyDocument => ({ date, type: 'daily', updatedAt: '', headings: [{ name: 'Work', items: [{ ...task }] }] })));
  const before = JSON.stringify(docs);
  findToday(App())!.onMoveTask!('same', '2026-10-22');
  expect(toast).toHaveBeenCalledWith('“Prepare” is already on Tomorrow.', { tone: 'info' });
  expect(setState).not.toHaveBeenCalled();
  expect(JSON.stringify(docs)).toBe(before);
});

it('moves a task within the current day and offers snapshot Undo', () => {
  vi.stubGlobal('window', { innerWidth: 1440, location: { search: '' } });
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('localStorage', { getItem: () => null });
  const task = { id: 'move-section', title: 'Prepare', status: 'not-started', createdDate: '2026-10-21', originalNoteDate: '2026-10-21', heading: 'Work', order: 1, historyLog: [] };
  const source: DailyDocument = { date: '2026-10-21', type: 'daily', updatedAt: 'before', headings: [{ name: 'Work', items: [task] }, { name: 'Ideas', items: [] }] };
  docs.splice(0, docs.length, source);
  findToday(App())!.onMoveToSection!('move-section', 'Ideas');
  const update = setState.mock.calls.at(-1)![0];
  const after: DailyDocument[] = typeof update === 'function' ? update(docs) : update;
  expect(after[0].headings.map((h) => h.items.map((t) => t.id))).toEqual([[], ['move-section']]);
  expect(after[0].headings[1].items[0].heading).toBe('Ideas');
  const options = toast.mock.calls.at(-1)![1];
  expect(options.action.label).toBe('Undo');
  // React has committed this state before the user can activate the toast.
  docs.splice(0, docs.length, ...after);
  options.action.onClick();
  const undo = setState.mock.calls.at(-1)![0];
  const restored: DailyDocument[] = typeof undo === 'function' ? undo(after) : undo;
  expect(restored[0].headings).toEqual(source.headings);
  expect(restored[0].updatedAt).not.toBe('before');
  expect(source.headings[0].items[0].heading).toBe('Work');
});

it('keeps a concurrent task rename and addition when section Undo would overwrite them', () => {
  vi.stubGlobal('window', { innerWidth: 1440, location: { search: '' } });
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('localStorage', { getItem: () => null });
  const task = { id: 'move-section', title: 'Prepare', status: 'not-started', createdDate: '2026-10-21', originalNoteDate: '2026-10-21', heading: 'Work', order: 1, historyLog: [] };
  docs.splice(0, docs.length, { date: '2026-10-21', type: 'daily', updatedAt: 'before', headings: [{ name: 'Work', items: [task] }, { name: 'Ideas', items: [] }] });
  findToday(App())!.onMoveToSection!('move-section', 'Ideas');
  const update = setState.mock.calls.at(-1)![0];
  const moved: DailyDocument[] = typeof update === 'function' ? update(docs) : update;
  const undoAction = toast.mock.calls.at(-1)![1].action.onClick;
  const concurrent: DailyDocument = { ...moved[0], updatedAt: 'newer', headings: moved[0].headings.map((h) => h.name === 'Work'
    ? { ...h, items: [{ ...task, id: 'added', title: 'Added on another device' }] }
    : { ...h, items: h.items.map((t) => ({ ...t, title: 'Renamed on another device' })) }) };
  docs.splice(0, docs.length, concurrent);
  setState.mockClear();
  undoAction();
  const pending = setState.mock.calls.at(-1)?.[0];
  const afterUndo: DailyDocument[] = typeof pending === 'function' ? pending(docs) : pending ?? docs;
  expect(afterUndo[0].headings.flatMap((h) => h.items.map((t) => [t.id, t.title]))).toEqual([
    ['added', 'Added on another device'], ['move-section', 'Renamed on another device'],
  ]);
  expect(toast).toHaveBeenLastCalledWith("Can't undo: the list changed since.", { tone: 'error' });
});
