// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { resolveMenuSide } from './appearance';
import { DEFAULT_APPEARANCE, DEFAULT_SETTINGS, normalizeSettings } from './defaultData';
import { toSyncedSettings } from '../sync/merge';
import { isSyncedSettings } from './vaultValidation';
import { AppearanceTab } from '../components/settings/AppearanceTab';

it('defaults left and keeps right through normalization, validation and sync projection', () => {
  expect(resolveMenuSide()).toBe('left');
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_APPEARANCE, menuSide: 'right' } });
  const incoming = JSON.parse(JSON.stringify(toSyncedSettings(settings)));
  expect(isSyncedSettings(incoming)).toBe(true);
  expect(resolveMenuSide(normalizeSettings(incoming).appearance)).toBe('right');
});

it('saves Menu side immediately through the existing appearance callback', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const el = document.createElement('div'); document.body.append(el);
  const root = createRoot(el);
  const onChange = vi.fn();
  try {
    await act(async () => root.render(React.createElement(AppearanceTab, { appearance: DEFAULT_APPEARANCE, onChange })));
    const right = [...el.querySelectorAll('button')].find(button => button.textContent === 'Right');
    expect(right).toBeDefined();
    await act(async () => right!.click());
    expect(onChange.mock.calls[0][0].menuSide).toBe('right');
  } finally { await act(async () => root.unmount()); el.remove(); vi.unstubAllGlobals(); }
});
