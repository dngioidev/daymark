import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppSettings, DailyDocument } from './types/daymark';
import type { VaultData } from './sync/syncClient';
import { DEFAULT_APPEARANCE, DEFAULT_SETTINGS } from './utils/defaultData';
import { reconcileBacklogVault } from './utils/backlog';
import { mergeDailyDocument } from './sync/merge';

const incomingSettings = vi.hoisted(() => ({ external: (_key: string, _value: unknown) => {}, sync: (_next: VaultData) => {} }));
const backups = vi.hoisted(() => ({ zip: vi.fn(async () => true), json: vi.fn(async () => true) }));

const { docs, toast, hooks } = vi.hoisted(() => ({ docs: [] as DailyDocument[], toast: vi.fn(), hooks: { values: [] as unknown[], index: 0, effects: [] as (() => unknown)[] } }));
vi.mock('react', async (original) => {
  const actual = await original<typeof React>();
  const reactHooks = {
    useState: (initial: unknown) => {
      const index = hooks.index++;
      if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next; }];
    },
    useEffect: (effect: () => unknown) => hooks.effects.push(effect), useMemo: (fn: () => unknown) => fn(), useRef: (current: unknown) => {
      const index = hooks.index++;
      if (!(index in hooks.values)) hooks.values[index] = { current };
      return hooks.values[index];
    },
  };
  return { ...actual, ...reactHooks, default: { ...actual, ...reactHooks } };
});
vi.mock('./utils/vaultStore', async (original) => ({
  ...await original<typeof import('./utils/vaultStore')>(),
  loadDailyDocuments: () => docs, loadSettings: () => DEFAULT_SETTINGS,
  loadStandaloneNotes: () => [], needsOnboarding: () => false,
  subscribeExternalChanges: (listener: typeof incomingSettings.external) => { incomingSettings.external = listener; return () => {}; },
  exportVaultAsZip: backups.zip, exportVaultAsJson: backups.json,
}));
const systemBars = vi.hoisted(() => ({ apply: vi.fn(), headerBg: '#12345680', headerBgOpaque: '#123456', headerText: '#ffffff' }));
const themeMeta = { content: '#1c1917' };
vi.mock('./hooks/useAppearance', async () => {
  const { resolveAppearance } = await import('./utils/appearance');
  const { DEFAULT_APPEARANCE } = await import('./utils/defaultData');
  return { useAppearance: () => ({ ...resolveAppearance(DEFAULT_APPEARANCE, null), headerBg: systemBars.headerBg, headerBgOpaque: systemBars.headerBgOpaque, headerText: systemBars.headerText }) };
});
vi.mock('./native/daymarkBridge', () => ({ isNativeApp: () => false, applySystemBars: systemBars.apply }));
vi.mock('./hooks/useBackgroundPhoto', () => ({ useBackgroundPhoto: () => ({ url: null, meta: null, photos: [], select: vi.fn(), add: vi.fn(), remove: vi.fn() }) }));
vi.mock('./hooks/useRealToday', () => ({ useRealToday: () => '2026-10-21' }));
vi.mock('./hooks/useWidgetSync', () => ({ useWidgetSync: () => {} }));
vi.mock('./native/backButton', () => ({ useBackHandler: () => {} }));
vi.mock('./hooks/useSync', () => ({ useSync: (_vault: VaultData, onChange: typeof incomingSettings.sync) => { incomingSettings.sync = onChange; return ({
  status: 'off', account: null, lastSyncAt: null, error: null, mode: 'local-web',
  connect: vi.fn(), disconnect: vi.fn(), signOut: vi.fn(), pendingChanges: () => 0,
  authFetch: vi.fn(), syncNow: vi.fn(), rebaseAfterReplace: vi.fn(),
}); } }));
vi.mock('./components/ui/feedback', async (original) => ({ ...await original<typeof import('./components/ui/feedback')>(), showToast: toast, confirmDialog: async () => true }));
import App from './App';
import { TodayView } from './components/TodayView';


import { SearchDialog } from './components/SearchDialog';
import { ShortcutHelp } from './components/ShortcutHelp';
import { QuickCaptureModal } from './components/QuickCaptureModal';
import { TaskHistoryDrawer } from './components/TaskHistoryDrawer';
import { StandaloneNotesView } from './components/StandaloneNotesView';
import { MobileAppShell } from './components/mobile/MobileAppShell';
import { SettingsModal } from './components/SettingsModal';
import { BacklogView } from './components/backlog/BacklogView';
import { SideRail } from './components/SideRail';
import { loadBacklog } from './utils/vaultStore';
import { reconcileBacklog, uneditedRecoveredBacklog, visibleBacklog } from './utils/backlog';
import { performDailyRollover } from './utils/lifecycleEngine';
const overlays = vi.hoisted(() => ({ dialog: false, menu: false }));
vi.mock('./components/ui/Dialog', async (original) => ({ ...await original<typeof import('./components/ui/Dialog')>(), isDialogOpen: () => overlays.dialog }));
vi.mock('./components/ui/Menu', async (original) => ({ ...await original<typeof import('./components/ui/Menu')>(), isMenuOpen: () => overlays.menu }));
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
  systemBars.headerBgOpaque = '#123456'; systemBars.headerText = '#ffffff';
  overlays.dialog = false; overlays.menu = false;
  hooks.values = []; vi.useFakeTimers();
  vi.stubGlobal('window', { innerWidth: 1440, location: { search: '' }, setTimeout, clearTimeout,
    addEventListener: (name: string, fn: (e: unknown) => void) => { if (name === 'keydown') listener = fn; }, removeEventListener: vi.fn() });
  themeMeta.content = '#1c1917';
  vi.stubGlobal('document', { cookie: '', querySelector: (selector: string) => selector === 'meta[name="theme-color"]' ? themeMeta : null, documentElement: { classList: { toggle: vi.fn(), remove: vi.fn() } } });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  docs.splice(0, docs.length, { date: '2026-10-20', type: 'daily', updatedAt: '', headings: [{ name: 'Work', items: [{ id: 't1', title: 'Found', status: 'done', createdDate: '2026-10-20', originalNoteDate: '2026-10-20', heading: 'Work', order: 0, historyLog: [] }] }] });
  render(); hooks.effects.forEach((effect) => effect());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('captures undated tasks, picks them into a matching section and returns them with Undo', () => {
  (props(QuickCaptureModal).onCaptureBacklog as (input: unknown) => void)({ title: 'Garden', category: 'Personal' });
  (props(SideRail).onTabChange as (tab: string) => void)('backlog');
  let page = props(BacklogView) as unknown as React.ComponentProps<typeof BacklogView>;
  const item = page.backlog.items.find((item) => item.title === 'Garden')!;
  expect(item).toBeDefined();
  expect(props(SearchDialog).backlog).toEqual(page.backlog);
  page.onPick(item.id, '2026-10-23');
  expect(toast).toHaveBeenLastCalledWith(expect.stringMatching(/^Added to .* in Personal$/), expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }));
  render();
  toast.mock.calls.at(-1)![1].action.onClick();
  page = props(BacklogView) as unknown as React.ComponentProps<typeof BacklogView>;
  expect(page.backlog.items.find((i) => i.id === item.id)?.pickedOn).toBeUndefined();
});
it('refuses pick Undo after another device edits the picked day', () => {
  (props(QuickCaptureModal).onCaptureBacklog as (input: unknown) => void)({ title: 'Garden', category: 'Personal' });
  (props(SideRail).onTabChange as (tab: string) => void)('backlog');
  const page = props(BacklogView) as unknown as React.ComponentProps<typeof BacklogView>;
  const item = page.backlog.items.find((i) => i.title === 'Garden')!;
  page.onPick(item.id, '2026-10-23');
  const undo = toast.mock.calls.at(-1)![1].action.onClick;
  (props(SearchDialog).onPick as (result: unknown) => void)({ kind: 'task', date: '2026-10-23', taskId: item.id });
  const daily = props(TodayView) as unknown as React.ComponentProps<typeof TodayView>;
  daily.onUpdateDocument({ ...daily.currentDocument, headings: daily.currentDocument.headings.map((h) => ({ ...h, notesContent: 'Concurrent note' })) });
  render(); undo();
  expect(toast).toHaveBeenLastCalledWith("Can't undo: the list changed since.", { tone: 'error' });
  expect((props(TodayView).currentDocument as DailyDocument).headings.some((h) => h.notesContent === 'Concurrent note')).toBe(true);
});
it('opens Backlog from search and the g b shortcut', () => {
  (props(SearchDialog).onPick as (result: unknown) => void)({ kind: 'backlog', itemId: 'undated', title: 'Idea' });
  expect(props(BacklogView)).toBeDefined();
  (props(SideRail).onTabChange as (tab: string) => void)('today');
  key('g'); key('b');
  expect(props(BacklogView)).toBeDefined();
});
it('moves an open daily task to backlog and restores the day with a backlog tombstone on Undo', () => {
  const daily = props(TodayView) as unknown as React.ComponentProps<typeof TodayView>;
  const source: DailyDocument = { ...docs[0], date: '2026-10-21', headings: [{ name: 'Work', notesContent: 'Keep this note', items: [{ ...docs[0].headings[0].items[0], id: 'move-backlog', status: 'in-progress' }] }] };
  daily.onUpdateDocument(source);
  (props(TodayView).onMoveToBacklog as (id: string) => void)('move-backlog');
  const undo = toast.mock.calls.at(-1)![1].action.onClick;
  const parkedDoc = props(TodayView).currentDocument as DailyDocument;
  expect((props(TodayView).currentDocument as DailyDocument).headings[0].items).toEqual([]);
  render(); undo();
  const restored = props(TodayView).currentDocument as DailyDocument;
  expect(restored.headings[0].notesContent).toBe('Keep this note');
  expect(restored.headings[0].items.map((i) => i.id)).toEqual(['move-backlog']);
  (props(SideRail).onTabChange as (tab: string) => void)('backlog');
  const page = props(BacklogView) as unknown as React.ComponentProps<typeof BacklogView>;
  expect(page.backlog.items.find((i) => i.id === 'move-backlog')?.deletedAt).toBeTruthy();
  const reconciled = reconcileBacklogVault(page.backlog, [restored]);
  expect(reconciled.docs[0].headings[0].items[0]).toMatchObject({ id: 'move-backlog', status: 'in-progress' });
  expect(reconciled.docs[0].headings[0].items[0].movedToBacklogDate).toBeUndefined();
  expect([source, null].map(base => mergeDailyDocument(base, parkedDoc, restored).value!.headings.flatMap(h => h.items)
    .some(task => task.id === 'move-backlog' && task.status === 'in-progress'))).toEqual([true, true]);
});
it('parks the latest open copy when moving an older carried copy and keeps its newer edits', () => {
  const original = { ...docs[0].headings[0].items[0], id: 'carried-backlog', status: 'in-progress', title: 'Old title' };
  const earlier: DailyDocument = { ...docs[0], date: '2026-10-21', headings: [{ name: 'Work', notesContent: 'Earlier daily note', items: [original] }] };
  const latest: DailyDocument = { ...docs[0], date: '2026-10-22', headings: [{ name: 'Personal', notesContent: 'Latest daily note', items: [{ ...original, title: 'Latest title', description: 'Edited on the latest day', heading: 'Personal', tags: ['latest'], checklist: [{ id: 'step', text: 'Keep this step', done: true }] }] }] };
  const archived: DailyDocument = { ...docs[0], date: '2026-10-23', headings: [{ name: 'Archive', notesContent: 'Archived daily note', items: [{ ...original, status: 'archived', title: 'Archived copy' }] }] };
  const closed: DailyDocument = { ...docs[0], date: '2026-10-24', headings: [{ name: 'Work', items: [{ ...original, movedToBacklogDate: '2026-10-25' }] }] };
  incomingSettings.sync({ docs: [archived, earlier, closed, latest], notes: [], settings: DEFAULT_SETTINGS, habits: { habits: [], days: [] }, backlog: { items: [] } });
  (props(TodayView).onMoveToBacklog as (id: string) => void)(original.id);
  const undo = toast.mock.calls.at(-1)![1].action.onClick;
  const search = props(SearchDialog) as unknown as React.ComponentProps<typeof SearchDialog>;
  expect(visibleBacklog(reconcileBacklog(search.backlog!, search.docs))).toEqual([expect.objectContaining({
    id: original.id, title: 'Latest title', description: 'Edited on the latest day', category: 'Personal',
    tags: ['latest'], checklist: [{ id: 'step', text: 'Keep this step', done: true }],
  })]);
  const byDate = (date: string) => search.docs.find((doc) => doc.date === date)!;
  expect(byDate('2026-10-22').headings[0]).toMatchObject({ notesContent: 'Latest daily note', items: [] });
  expect(byDate('2026-10-21').headings[0]).toMatchObject({ notesContent: 'Earlier daily note', items: [expect.objectContaining({ title: 'Old title', status: 'done', movedToBacklogDate: '2026-10-22' })] });
  expect(byDate('2026-10-23')).toBe(archived);
  expect(byDate('2026-10-24')).toBe(closed);
  const rollover = performDailyRollover('2026-10-25', search.docs, DEFAULT_SETTINGS.statuses, DEFAULT_SETTINGS.defaultHeadings);
  expect(rollover.updatedDocs.find((doc) => doc.date === '2026-10-25')!.headings.flatMap((heading) => heading.items).some((task) => task.id === original.id)).toBe(false);
  render(); undo();
  const before = [archived, earlier, closed, latest];
  const restored = (props(SearchDialog).docs as DailyDocument[]).map(doc => ({ date: doc.date, headings: doc.headings.map(heading => ({ ...heading, items: heading.items.map(task => {
    const prior = before.find(d => d.date === doc.date)!.headings.flatMap(h => h.items).find(t => t.id === task.id)!;
    if (prior.status === 'done' || prior.status === 'archived' || prior.doneLaterDate || prior.movedToBacklogDate) return task;
    expect(task.historyLog.slice(0, -1)).toEqual(prior.historyLog);
    expect(task.historyLog.at(-1)?.details).toBe('Undid move to backlog');
    return { ...task, historyLog: prior.historyLog };
  }) })) }));
  expect(restored).toEqual(before.map(doc => ({ date: doc.date, headings: doc.headings })));
});
it('refuses move Undo after a concurrent day-note edit', () => {
  const source: DailyDocument = { ...docs[0], date: '2026-10-21', headings: [{ name: 'Work', items: [{ ...docs[0].headings[0].items[0], id: 'move-backlog', status: 'in-progress' }] }] };
  (props(TodayView).onUpdateDocument as (doc: DailyDocument) => void)(source);
  (props(TodayView).onMoveToBacklog as (id: string) => void)('move-backlog');
  const undo = toast.mock.calls.at(-1)![1].action.onClick;
  const moved = props(TodayView).currentDocument as DailyDocument;
  (props(TodayView).onUpdateDocument as (doc: DailyDocument) => void)({ ...moved, headings: [{ ...moved.headings[0], notesContent: 'Added elsewhere' }] });
  render(); undo();
  expect(toast).toHaveBeenLastCalledWith("Can't undo: the list changed since.", { tone: 'error' });
  expect((props(TodayView).currentDocument as DailyDocument).headings[0].notesContent).toBe('Added elsewhere');
});
it('restores deleted backlog items without replacing concurrent item edits', () => {
  (props(QuickCaptureModal).onCaptureBacklog as (input: unknown) => void)({ title: 'Delete trial' });
  (props(SideRail).onTabChange as (tab: string) => void)('backlog');
  const page = props(BacklogView) as unknown as React.ComponentProps<typeof BacklogView>;
  const id = page.backlog.items.find((i) => i.title === 'Delete trial')!.id;
  page.onRemove(id); render(); page.onRestore(id);
  let current = props(BacklogView) as unknown as React.ComponentProps<typeof BacklogView>;
  expect(current.backlog.items.find((i) => i.id === id)?.deletedAt).toBeUndefined();
  current.onRemove(id); current = props(BacklogView) as unknown as React.ComponentProps<typeof BacklogView>;
  incomingSettings.sync({ docs: [], notes: [], habits: { habits: [], days: [] }, settings: DEFAULT_SETTINGS,
    backlog: { items: current.backlog.items.map((i) => i.id === id ? { ...i, title: 'Edited elsewhere' } : i) } });
  render(); page.onRestore(id);
  expect(toast).toHaveBeenLastCalledWith("Can't undo: the list changed since.", { tone: 'error' });
  expect((props(BacklogView).backlog as { items: { id: string; title: string }[] }).items.find((i) => i.id === id)?.title).toBe('Edited elsewhere');
});
it('keeps damaged backlog recovery protected during automatic reconciliation', () => {
  const recovered = { items: [{ id: 't1', title: 'Recovered', order: 1, createdAt: '', updatedAt: '' }] };
  uneditedRecoveredBacklog.add(recovered);
  incomingSettings.sync({ docs: [{ ...docs[0], headings: [{ name: 'Work', items: [{ ...docs[0].headings[0].items[0], status: 'in-progress' }] }] }], notes: [], habits: { habits: [], days: [] }, settings: DEFAULT_SETTINGS, backlog: recovered });
  render(); hooks.effects.forEach((effect) => effect());
  const reconciled = props(SearchDialog).backlog as typeof recovered;
  expect(reconciled.items[0]).toHaveProperty('pickedOn', '2026-10-20');
  expect(uneditedRecoveredBacklog.has(reconciled)).toBe(true);
});
it('includes the stored backlog in both backup formats', async () => {
  const stored = loadBacklog();
  await (props(SettingsModal).onExportZip as () => Promise<void>)();
  await (props(SettingsModal).onExportJson as () => Promise<void>)();
  expect(backups.zip).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), expect.any(Object), expect.any(Object), expect.any(Function), stored);
  expect(backups.json).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), expect.any(Object), expect.any(Object), expect.any(Function), stored);
});
it('preserves backlog for old or damaged backups and replaces it for valid backups', async () => {
  (props(QuickCaptureModal).onCaptureBacklog as (input: unknown) => void)({ title: 'Keep on legacy restore' });
  const before = props(SearchDialog).backlog;
  for (const extra of [{}, { backlog: { damaged: true } }]) {
    await (props(SettingsModal).onImportJson as (text: string) => Promise<void>)(JSON.stringify({ daily_documents: [], standalone_notes: [], ...extra }));
    expect(props(SearchDialog).backlog).toBe(before);
  }
  const restored = { items: [{ id: 'restored', title: 'From backup', order: 1, createdAt: '', updatedAt: '' }] };
  await (props(SettingsModal).onImportJson as (text: string) => Promise<void>)(JSON.stringify({ daily_documents: [], standalone_notes: [], backlog: restored }));
  expect(props(SearchDialog).backlog).toEqual(restored);
});
it('updates system bars with the opaque header colour and resolved icon contrast', () => {
  expect(systemBars.apply).toHaveBeenLastCalledWith('#123456', true);
  systemBars.headerBgOpaque = '#eeeeee'; systemBars.headerText = '#1c1917';
  render(); hooks.effects.forEach((effect) => effect());
  expect(systemBars.apply).toHaveBeenLastCalledWith('#eeeeee', false);
});
it('updates the web theme colour with the resolved opaque header colour', () => {
  expect(themeMeta.content).toBe('#123456');
  systemBars.headerBgOpaque = '#eeeeee';
  render(); hooks.effects.forEach((effect) => effect());
  expect(themeMeta.content).toBe('#eeeeee');
});
it.each(['external', 'sync'] as const)('preserves the latest local appearance for legacy %s settings', (path) => {
  const local = { ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_APPEARANCE, theme: 'dark' as const, dim: 60 } };
  (props(SettingsModal).onChangeSettings as (settings: AppSettings) => void)(local);
  // Deliver through the already registered callback, before another render.
  const { appearance: _appearance, ...legacy } = DEFAULT_SETTINGS;
  const incoming = { ...legacy, defaultHeadings: [], timeZone: 'Asia/Saigon' };
  if (path === 'external') incomingSettings.external('settings', incoming);
  else incomingSettings.sync({ docs: [], notes: [], settings: incoming, habits: { habits: [], days: [] }, backlog: { items: [] } });
  expect(props(SettingsModal).settings).toMatchObject({
    appearance: local.appearance, timeZone: 'Asia/Saigon', defaultHeadings: ['Work', 'Meetings', 'Ideas', 'Attention'],
  });
});
it('keeps light icons over the phone Settings dark strip and restores the header on close', () => {
  systemBars.headerBgOpaque = '#eeeeee'; systemBars.headerText = '#1c1917';
  (render().find((el) => typeof el.props.onPreviewPhone === 'function')!.props.onPreviewPhone as () => void)();
  (props(MobileAppShell).onOpenSettings as () => void)();
  render(); hooks.effects.forEach((effect) => effect());
  expect(systemBars.apply).toHaveBeenLastCalledWith('#1c1917', true);
  (props(SettingsModal).onClose as () => void)();
  render(); hooks.effects.forEach((effect) => effect());
  expect(systemBars.apply).toHaveBeenLastCalledWith('#eeeeee', false);
});
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
  (render().find((el) => typeof el.props.onPreviewPhone === 'function')!.props.onPreviewPhone as () => void)();
  (props(SearchDialog).onPick as (r: unknown) => void)({ kind: 'note', noteId: 'chosen' });
  expect(props(MobileAppShell)).toMatchObject({ activeTab: 'notes', openNoteId: 'chosen' });
  (props(SearchDialog).onPick as (r: unknown) => void)({ kind: 'task', taskId: 't1', date: '2026-10-20' });
  expect(props(MobileAppShell).activeTab).toBe('today');
});
it('allows searching for the same note again after selecting another note locally', () => {
  (props(SearchDialog).onPick as (r: unknown) => void)({ kind: 'note', noteId: 'chosen' });
  (props(StandaloneNotesView).onOpenNoteConsumed as () => void)();
  const header = render().find((el) => typeof el.props.onOpenSearch === 'function')!;
  (header.props.onOpenSearch as () => void)();
  expect(props(StandaloneNotesView).openNoteId).toBeUndefined();
  (props(SearchDialog).onPick as (r: unknown) => void)({ kind: 'note', noteId: 'chosen' });
  expect(props(StandaloneNotesView).openNoteId).toBe('chosen');
});

it.each(['dialog', 'menu'] as const)('blocks global shortcuts while a %s is open, preserving exceptions', (overlay) => {
  key('g'); key('n');
  render(); hooks.effects.forEach((effect) => effect());
  key('g');
  overlays[overlay] = true;
  key('t'); key('/'); key('?'); key('F', { ctrlKey: true, shiftKey: true }); key('g'); key('t');
  expect(props(SearchDialog).isOpen).toBe(false);
  expect(props(ShortcutHelp).isOpen).toBe(false);
  expect(props(StandaloneNotesView).focusToggleSignal).toBe(0);
  key('k', { ctrlKey: true });
  expect(props(QuickCaptureModal).isOpen).toBe(true);
  key('.', { metaKey: true });
  expect(props(StandaloneNotesView).focusToggleSignal).toBe(1);
  overlays[overlay] = false;
  key('t'); // The prefix used inside the overlay must not leak out.
  expect(render().some((el) => el.type === StandaloneNotesView)).toBe(true);
  key('/'); expect(props(SearchDialog).isOpen).toBe(true);
});

it.each([false, true])('clears a consumed note request before Notes is revisited (phone=%s)', (phone) => {
  if (phone) (render().find((el) => typeof el.props.onPreviewPhone === 'function')!.props.onPreviewPhone as () => void)();
  (props(SearchDialog).onPick as (r: unknown) => void)({ kind: 'note', noteId: 'chosen' });
  const component = phone ? MobileAppShell : StandaloneNotesView;
  (props(component).onOpenNoteConsumed as () => void)();
  key('g'); key('t'); key('g'); key('n');
  expect(props(component).openNoteId).toBeUndefined();
});

it('hides the desktop rail only while Notes reports focus mode', () => {
  (props(SideRail).onTabChange as (tab: string) => void)('notes');
  (props(StandaloneNotesView).onFocusModeChange as (focused: boolean) => void)(true);
  expect(props(SideRail).hidden).toBe(true);
  (props(SideRail).onTabChange as (tab: string) => void)('today');
  expect(props(SideRail).hidden).toBe(false);
  (props(SideRail).onTabChange as (tab: string) => void)('notes');
  (props(StandaloneNotesView).onFocusModeChange as (focused: boolean) => void)(false);
  expect(props(SideRail).hidden).toBe(false);
});

it.each(['today', 'calendar', 'notes', 'backlog', 'mobile-code'])('names the desktop %s page with an accessible hidden heading', (tab) => {
  (props(SideRail).onTabChange as (tab: string) => void)(tab);
  const heading = render().find(el => el.type === 'h1' && el.props.className === 'sr-only');
  expect(heading?.props.children).toBe(tab === 'mobile-code' ? 'Mobile & Code' : tab[0].toUpperCase() + tab.slice(1));
});
