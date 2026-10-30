// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppSettings } from '../../types/daymark';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsModal } from '../SettingsModal';
import { DEFAULT_SETTINGS } from '../../utils/defaultData';
const { native } = vi.hoisted(() => ({ native: vi.fn(() => false) }));
vi.mock('../../native/daymarkBridge', () => ({ isNativeApp: native }));
vi.mock('react-dom', () => ({ createPortal: (node: React.ReactNode) => node }));
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});
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

it('shows Widget before Advanced inside the Android app', () => {
  native.mockReturnValue(true);
  vi.stubGlobal('document', { body: {} });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
  const noop = () => {};
  const html = renderToStaticMarkup(React.createElement(SettingsModal, {
    isOpen: true, onClose: noop, settings: DEFAULT_SETTINGS, onChangeSettings: noop,
    onExportZip: noop, onExportJson: noop, onImportJson: noop, onImportZip: noop, onResetVault: noop, syncPanel: null,
  }));
  expect(html).toContain('settings-tab-widget');
  expect(html.indexOf('settings-tab-widget')).toBeLessThan(html.indexOf('settings-tab-advanced'));
  native.mockReturnValue(false);
});

it('offers separate task and habit widget pinning from Storage', () => {
  native.mockReturnValue(true);
  vi.stubGlobal('document', { body: {} });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
  const noop = () => {};
  const html = renderToStaticMarkup(React.createElement(SettingsModal, {
    isOpen: true, onClose: noop, settings: DEFAULT_SETTINGS, onChangeSettings: noop,
    onExportZip: noop, onExportJson: noop, onImportJson: noop, onImportZip: noop, onResetVault: noop, syncPanel: null,
    initialTab: 'storage',
  }));
  expect(html).toContain('Add tasks widget');
  expect(html).toContain('Add habits widget');
  native.mockReturnValue(false);
});

async function mountAging(settings: AppSettings = structuredClone(DEFAULT_SETTINGS)) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const save = vi.fn();
  const host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  const noop = () => {};
  await act(async () => root!.render(React.createElement(SettingsModal, {
    isOpen: true, onClose: noop, settings, onChangeSettings: save,
    onExportZip: noop, onExportJson: noop, onImportJson: noop, onImportZip: noop,
    onResetVault: noop, syncPanel: null, initialTab: 'aging',
  })));
  return save;
}

function choiceGroup(label: string) {
  const group = [...document.querySelectorAll('fieldset')].find(el => el.querySelector('legend')?.textContent === label);
  expect(group, `choice group: ${label}`).toBeDefined();
  return group!;
}

function radio(group: Element, value: string) {
  const input = group.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`);
  expect(input, `radio: ${value}`).not.toBeNull();
  return input!;
}

it('renders separate counting groups with All week selected without saving absent alertDays', async () => {
  const settings = structuredClone(DEFAULT_SETTINGS);
  delete settings.alertDays;
  const save = await mountAging(settings);
  for (const label of ['Task aging counts', 'Habit warnings count']) {
    const group = choiceGroup(label);
    expect(group.querySelectorAll('input[type="radio"]')).toHaveLength(3);
    for (const text of ['Weekdays (Mon to Fri)', 'Weekends (Sat and Sun)', 'All week']) {
      expect(group.textContent).toContain(text);
    }
    expect(radio(group, 'all').checked).toBe(true);
  }
  expect(save).not.toHaveBeenCalled();
  expect(settings).not.toHaveProperty('alertDays');
});

it.each([undefined, 'weekend'] as const)('saves task weekdays while preserving current habit choice %s', async (habits) => {
  const settings = structuredClone(DEFAULT_SETTINGS);
  if (habits) settings.alertDays = { tasks: 'all', habits };
  const save = await mountAging(settings);
  await act(async () => radio(choiceGroup('Task aging counts'), 'weekdays').click());
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0]).toEqual({ ...settings, alertDays: { tasks: 'weekdays', habits: habits ?? 'all' } });
  expect(radio(choiceGroup('Task aging counts'), 'weekdays').checked).toBe(true);
  expect(radio(choiceGroup('Habit warnings count'), habits ?? 'all').checked).toBe(true);
});

it('saves habit weekends while preserving the task choice and other settings', async () => {
  const settings: AppSettings = { ...structuredClone(DEFAULT_SETTINGS), alertDays: { tasks: 'weekdays', habits: 'all' } };
  const save = await mountAging(settings);
  await act(async () => radio(choiceGroup('Habit warnings count'), 'weekend').click());
  expect(save.mock.calls[0][0]).toEqual({ ...settings, alertDays: { tasks: 'weekdays', habits: 'weekend' } });
});
