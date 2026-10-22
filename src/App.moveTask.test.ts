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
vi.mock('./hooks/useAppearance', () => ({ useAppearance: () => {} }));
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
