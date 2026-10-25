// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsModal } from '../SettingsModal';
import { DEFAULT_SETTINGS } from '../../utils/defaultData';
const { confirm, toast, cleanup, list } = vi.hoisted(() => ({
  confirm: vi.fn(), toast: vi.fn(), cleanup: vi.fn(), list: vi.fn(),
}));
vi.mock('../../utils/noteAssets', () => ({ listAssets: list }));
vi.mock('../../native/daymarkBridge', () => ({ isNativeApp: () => false }));
vi.mock('../ui/feedback', () => ({ confirmDialog: confirm, showToast: toast, alertDialog: vi.fn() }));
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ''; vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function mount() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  list.mockResolvedValue([{ bytes: 1_000_000 }, { bytes: 500_000 }]);
  const container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  const noop = () => {};
  await act(async () => root.render(React.createElement(SettingsModal, {
    isOpen: true, onClose: noop, settings: DEFAULT_SETTINGS, onChangeSettings: noop,
    onExportZip: noop, onExportJson: noop, onImportJson: noop, onImportZip: noop, onResetVault: noop,
    syncPanel: null, initialTab: 'storage', onRemoveUnusedPictures: cleanup,
  })));
}
it('Storage shows local picture usage and cancellation never removes pictures', async () => {
  await mount();
  expect(document.body.textContent).toContain('Pictures: 2 · 1.5 MB');
  confirm.mockResolvedValue(false);
  const button = [...document.querySelectorAll('button')].find(button => button.textContent === 'Remove unused pictures')!;
  expect(button).toBeDefined();
  await act(async () => button.click());
  expect(cleanup).not.toHaveBeenCalled();
});
it('confirmed picture cleanup toasts the count and refreshes local usage', async () => {
  await mount();
  confirm.mockResolvedValue(true);
  cleanup.mockImplementation(async () => { list.mockResolvedValue([{ bytes: 500_000 }]); return 1; });
  const button = [...document.querySelectorAll('button')].find(button => button.textContent === 'Remove unused pictures')!;
  await act(async () => button.click());
  expect(toast).toHaveBeenCalledWith('Removed 1 unused picture.');
  expect(document.body.textContent).toContain('Pictures: 1 · 0.5 MB');
});
