import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from './utils/defaultData';
const { toast, dismiss, exporter, refs, metaSet } = vi.hoisted(() => ({ toast: vi.fn(), dismiss: vi.fn(), metaSet: vi.fn(),
  exporter: vi.fn(async (_docs: unknown, _notes: unknown, _settings: unknown, _habits: unknown, onMissing?: (count: number) => void) => { onMissing?.(2); return true; }),
  refs: [] as { current: unknown }[],
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof React>();
  const hooks = {
    useState: (initial: unknown) => {
      const value = typeof initial === 'function' ? initial() : initial;
      return [value, value && typeof value === 'object' && 'folders' in value ? metaSet : vi.fn()];
    },
    useEffect: () => {}, useMemo: (fn: () => unknown) => fn(),
    useRef: (current: unknown) => { const ref = { current }; refs.push(ref); return ref; },
  };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});
vi.mock('./utils/vaultStore', async (original) => ({
  ...await original<typeof import('./utils/vaultStore')>(),
  loadDailyDocuments: () => [], loadSettings: () => DEFAULT_SETTINGS, loadStandaloneNotes: () => [],
  needsOnboarding: () => false, exportVaultAsZip: exporter, exportVaultAsJson: exporter,
}));
vi.mock('./hooks/useAppearance', async () => {
  const { resolveAppearance } = await import('./utils/appearance');
  const { DEFAULT_APPEARANCE } = await import('./utils/defaultData');
  return { useAppearance: () => resolveAppearance(DEFAULT_APPEARANCE, null) };
});
vi.mock('./hooks/useBackgroundPhoto', () => ({ useBackgroundPhoto: () => ({ url: null, meta: null, photos: [] }) }));
vi.mock('./hooks/useRealToday', () => ({ useRealToday: () => '2026-10-25' }));
vi.mock('./hooks/useWidgetSync', () => ({ useWidgetSync: () => {} }));
vi.mock('./native/backButton', () => ({ useBackHandler: () => {} }));
vi.mock('./hooks/useSync', () => ({ useSync: () => ({
  status: 'off', account: null, lastSyncAt: null, error: null, mode: 'local-web',
  connect: vi.fn(), disconnect: vi.fn(), signOut: vi.fn(), pendingChanges: () => 0,
  authFetch: vi.fn(), syncNow: vi.fn(), rebaseAfterReplace: vi.fn(),
}) }));
vi.mock('./components/ui/feedback', async (original) => ({ ...await original<typeof import('./components/ui/feedback')>(), showToast: toast, dismissToast: dismiss }));
import App from './App';
import { SettingsModal } from './components/SettingsModal';
function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as React.ReactNode)];
}
function settings() {
  refs.length = 0;
  vi.stubGlobal('window', { innerWidth: 1440, location: { search: '' } });
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  return elements(App()).find(element => element.type === SettingsModal)!.props as unknown as React.ComponentProps<typeof SettingsModal>;
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it.each(['onExportZip', 'onExportJson'] as const)('backup toast reports missing local pictures for %s', async action => {
  await settings()[action]();
  expect(toast).toHaveBeenCalledWith(expect.stringContaining('2 pictures were not included (not on this device yet)'));
});
it('cleanup clears the open editor history and dismisses the pending Undo toast', async () => {
  const props = settings();
  // The shared editor ref starts null and is populated by the mounted Notes editor.
  const clearHistory = vi.fn();
  const editorRef = refs.find(ref => ref.current === null && 'current' in ref)!;
  editorRef.current = { clearHistory, focus: vi.fn() };
  await props.onRemoveUnusedPictures!();
  expect(clearHistory).toHaveBeenCalledOnce();
  expect(dismiss).toHaveBeenCalledOnce();
});
it('JSON restore without picture storage restores the vault and toasts the skipped pictures', async () => {
  await settings().onImportJson(JSON.stringify({ daily_documents: [], standalone_notes: [], assets: [{ meta: {}, data: 'YWJj' }] }));
  expect(toast).toHaveBeenCalledWith(expect.stringMatching(/restored.*1.*picture.*skipped/i));
});

it.each(['onExportZip', 'onExportJson'] as const)('backup toast uses singular for one missing picture: %s', async action => {
  exporter.mockImplementationOnce(async (_docs, _notes, _settings, _habits, onMissing) => { onMissing?.(1); return true; });
  await settings()[action]();
  expect(toast).toHaveBeenCalledWith(expect.stringContaining('1 picture was not included'));
});
it.each([1, 2])('restore toast uses correct skipped grammar for %s', async count => {
  await settings().onImportJson(JSON.stringify({ daily_documents: [], standalone_notes: [], assets: Array.from({ length: count }, () => ({ meta: {}, data: 'YWJj' })) }));
  expect(toast).toHaveBeenCalledWith(expect.stringContaining(count === 1 ? '1 picture was skipped' : '2 pictures were skipped'));
});

it.each([1, 2])('Markdown-folder ZIP restore reports the skipped picture count (%s)', async count => {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip(); zip.file('Notes/Imported.md', 'Keep my note');
  for (let index = 0; index < count; index++) zip.file('Notes/_assets/bad-' + index + '.svg', '<svg/>');
  await settings().onImportZip(await zip.generateAsync({ type: 'uint8array' }) as unknown as File);
  expect(toast).toHaveBeenCalledWith(expect.stringContaining(count === 1 ? '1 picture was skipped' : '2 pictures were skipped'));
});

it('JSON restore restores folders and dismissals into the live metadata state', async () => {
  const notemeta = { folders: [{ path: 'Tech/Empty', updatedAt: '2026-10-28T00:00:00Z' }], dismissed: [{ key: 'a|b', at: '2026-10-28T00:00:00Z' }] };
  await settings().onImportJson(JSON.stringify({ daily_documents: [], standalone_notes: [], notemeta }));
  expect(metaSet).toHaveBeenCalledOnce();
  expect(metaSet.mock.calls[0][0]({ folders: [], dismissed: [] })).toEqual(notemeta);
});
it('ZIP restore restores folders and dismissals into the live metadata state', async () => {
  const JSZip = (await import('jszip')).default;
  const notemeta = { folders: [{ path: 'Empty', updatedAt: '2026-10-28T00:00:00Z' }], dismissed: [] };
  const zip = new JSZip(); zip.file('.daymark/vault.json', JSON.stringify({ daily_documents: [], standalone_notes: [], notemeta }));
  await settings().onImportZip(await zip.generateAsync({ type: 'uint8array' }) as unknown as File);
  expect(metaSet).toHaveBeenCalledOnce();
  expect(metaSet.mock.calls[0][0]({ folders: [], dismissed: [] })).toEqual(notemeta);
});
it('sample reset replaces the live metadata state with the seed metadata', () => {
  settings().onResetVault();
  expect(metaSet).toHaveBeenCalledWith({ folders: [], dismissed: [] });
});
