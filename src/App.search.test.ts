import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DailyDocument } from './types/daymark';
import { DEFAULT_SETTINGS } from './utils/defaultData';

const { docs, toast, hooks } = vi.hoisted(() => ({ docs: [] as DailyDocument[], toast: vi.fn(), hooks: { values: [] as unknown[], index: 0, effects: [] as (() => unknown)[] } }));
vi.mock('react', async (original) => {
  const actual = await original<typeof React>();
  const reactHooks = {
    useState: (initial: unknown) => {
      const index = hooks.index++;
      if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next; }];
    },
    useEffect: (effect: () => unknown) => hooks.effects.push(effect), useMemo: (fn: () => unknown) => fn(), useRef: (current: unknown) => ({ current }),
  };
  return { ...actual, ...reactHooks, default: { ...actual, ...reactHooks } };
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


import { SearchDialog } from './components/SearchDialog';
import { ShortcutHelp } from './components/ShortcutHelp';
import { QuickCaptureModal } from './components/QuickCaptureModal';
import { TaskHistoryDrawer } from './components/TaskHistoryDrawer';
import { StandaloneNotesView } from './components/StandaloneNotesView';
import { MobileAppShell } from './components/mobile/MobileAppShell';
type Element = React.ReactElement<Record<string, unknown>>;
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as React.ReactNode)];
}
function render() { hooks.index = 0; hooks.effects = []; return elements(App()); }
function props(type: unknown) { return render().find((el) => el.type === type)!.props; }
let listener: (e: unknown) => void;
function key(key: string, extra = {}) { listener({ key, target: { closest: () => null }, preventDefault: vi.fn(), ...extra }); }
beforeEach(() => {
  hooks.values = []; vi.useFakeTimers();
  vi.stubGlobal('window', { innerWidth: 1440, location: { search: '' }, setTimeout, clearTimeout,
    addEventListener: (name: string, fn: (e: unknown) => void) => { if (name === 'keydown') listener = fn; }, removeEventListener: vi.fn() });
  vi.stubGlobal('document', { cookie: '', documentElement: { classList: { toggle: vi.fn(), remove: vi.fn() } } });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  docs.splice(0, docs.length, { date: '2026-10-20', type: 'daily', updatedAt: '', headings: [{ name: 'Work', items: [{ id: 't1', title: 'Found', status: 'done', createdDate: '2026-10-20', originalNoteDate: '2026-10-20', heading: 'Work', order: 0, historyLog: [] }] }] });
  render(); hooks.effects.forEach((effect) => effect());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('keeps Ctrl K new-task, opens search and help, and expires g after 1.5 seconds', () => {
  key('k', { ctrlKey: true }); expect(props(QuickCaptureModal).isOpen).toBe(true);
  key('F', { ctrlKey: true, shiftKey: true }); expect(props(SearchDialog).isOpen).toBe(true);
  (props(SearchDialog).onClose as () => void)();
  key('?'); expect(props(ShortcutHelp).isOpen).toBe(true);
  key('g'); vi.advanceTimersByTime(1500); key('n');
  expect(render().some((el) => el.type === StandaloneNotesView)).toBe(false);
  key('g'); vi.advanceTimersByTime(1499); key('n');
  expect(render().some((el) => el.type === StandaloneNotesView)).toBe(true);
});
it('opens a task on its day with its details, then a note on Notes', () => {
  const pick = props(SearchDialog).onPick as (result: unknown) => void;
  pick({ kind: 'task', taskId: 't1', date: '2026-10-20' });
  expect((props(TodayView).currentDocument as DailyDocument).date).toBe('2026-10-20');
  expect(props(TaskHistoryDrawer).task).toMatchObject({ id: 't1' });
  pick({ kind: 'note', noteId: 'chosen' });
  expect(props(StandaloneNotesView).openNoteId).toBe('chosen');
});
it('only signals focus on Notes, including while typing', () => {
  key('.', { ctrlKey: true });
  key('g'); key('n');
  expect(props(StandaloneNotesView).focusToggleSignal).toBe(0);
  render(); hooks.effects.forEach((effect) => effect());
  key('.', { metaKey: true, target: { closest: () => ({}) } });
  expect(props(StandaloneNotesView).focusToggleSignal).toBe(1);
});
it('routes search results into the controlled phone tab', () => {
  (render().find((el) => typeof el.props.onSwitchToMobileApp === 'function')!.props.onSwitchToMobileApp as () => void)();
  (props(SearchDialog).onPick as (r: unknown) => void)({ kind: 'note', noteId: 'chosen' });
  expect(props(MobileAppShell)).toMatchObject({ activeTab: 'notes', openNoteId: 'chosen' });
  (props(SearchDialog).onPick as (r: unknown) => void)({ kind: 'task', taskId: 't1', date: '2026-10-20' });
  expect(props(MobileAppShell).activeTab).toBe('today');
});
it('allows searching for the same note again after selecting another note locally', () => {
  (props(SearchDialog).onPick as (r: unknown) => void)({ kind: 'note', noteId: 'chosen' });
  // Clear the previous request when opening search so choosing the same id triggers Notes again.
  const header = render().find((el) => typeof el.props.onOpenSearch === 'function')!;
  (header.props.onOpenSearch as () => void)();
  expect(props(StandaloneNotesView).openNoteId).toBeUndefined();
  (props(SearchDialog).onPick as (r: unknown) => void)({ kind: 'note', noteId: 'chosen' });
  expect(props(StandaloneNotesView).openNoteId).toBe('chosen');
});
