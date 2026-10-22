import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsModal } from '../SettingsModal';
import { DEFAULT_SETTINGS } from '../../utils/defaultData';
vi.mock('react-dom', () => ({ createPortal: (node: React.ReactNode) => node }));
afterEach(() => vi.unstubAllGlobals());
it('uses the fixed desktop shell, a plain title, side tabs and Appearance by default without Save/Cancel/Widget', () => {
  vi.stubGlobal('document', { body: {} });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
  const noop = () => {};
  const html = renderToStaticMarkup(React.createElement(SettingsModal, {
    isOpen: true, onClose: noop, settings: DEFAULT_SETTINGS, onChangeSettings: noop,
    onExportZip: noop, onExportJson: noop, onImportJson: noop, onImportZip: noop, onResetVault: noop, syncPanel: null,
  }));
  expect(html).toContain('sm:w-[min(760px,calc(100vw-2rem))]');
  expect(html).toContain('sm:h-[min(560px,calc(100vh-2rem))]');
  expect(html).toContain('aria-orientation="vertical"');
  expect(html).toMatch(/<h2[^>]*>Settings<\/h2>/);
  expect(html).toContain('id="settings-panel-appearance"');
  expect(html).toContain('Reset to defaults');
  expect(html).not.toMatch(/Save changes|Cancel|settings-tab-widget/);
});
