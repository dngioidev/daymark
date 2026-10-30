// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { BackgroundPhotoSection } from './BackgroundPhotoSection';
import { useBackgroundPhoto } from '../../hooks/useBackgroundPhoto';
import { useAppearance } from '../../hooks/useAppearance';
import { DEFAULT_APPEARANCE, DEFAULT_SETTINGS } from '../../utils/defaultData';
import { fromEntities } from '../../sync/syncClient';
vi.mock('../../utils/vaultStore', () => ({
  isPhotoStorageAvailable: vi.fn(() => true),
  kvGetRaw: async () => undefined,
}));
import { isPhotoStorageAvailable } from '../../utils/vaultStore';
afterEach(() => vi.mocked(isPhotoStorageAvailable).mockReturnValue(true));
it('shows None, five selectable and removable thumbnails and the device-only caption', () => {
  const photos = Array.from({ length: 5 }, (_, slot) => ({ slot, addedAt: '2026-10-22', width: 100, height: 100, luminance: 0.5 }));
  const html = renderToStaticMarkup(React.createElement(BackgroundPhotoSection, { background: { photos, meta: photos[2], url: null, select: vi.fn(), add: vi.fn(), remove: vi.fn() } }));
  for (const photo of photos) {
    expect(html).toContain(`Select photo ${photo.slot + 1}`);
    expect(html).toContain(`Remove photo ${photo.slot + 1}`);
  }
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('None'); expect(html).toContain('+ Add');
  expect(html).toContain('accept="image/*"');
  expect(html).toContain("Photos stay on this device and aren&#x27;t synced or backed up.");
  expect(html).not.toContain('If you chose a photo on another device');
});

it('uses the synced appearance without a local photo and explains the other-device fallback', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const consoleError = vi.spyOn(console, 'error');
  const appearance = { ...DEFAULT_APPEARANCE, theme: 'dark' as const, dim: 45, blur: 6,
    dark: { ...DEFAULT_APPEARANCE.dark, headerOpacity: 0 } };
  // Consume settings as a receiving device does; its raw photo storage is empty.
  const received = fromEntities(new Map([['settings', { ...DEFAULT_SETTINGS, appearance }]]), DEFAULT_SETTINGS);
  let background: ReturnType<typeof useBackgroundPhoto> | undefined;
  let headerBackdrop: string | undefined;
  function Settings() {
    background = useBackgroundPhoto();
    headerBackdrop = useAppearance(received.settings.appearance!, background.meta).headerBgOpaque;
    return React.createElement(BackgroundPhotoSection, { background });
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => { root.render(React.createElement(Settings)); });
    expect(background?.photos).toEqual([]);
    expect(background?.meta).toBeNull();
    expect(background?.url).toBeNull();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    // A transparent header composites over the plain dark page, with no photo.
    expect(headerBackdrop).toBe('#0c0a09');
    expect(document.documentElement.style.getPropertyValue('--dm-dim')).toBe('0.45');
    expect(document.documentElement.style.getPropertyValue('--dm-blur')).toBe('6px');
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('If you chose a photo on another device, add it here too.');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    consoleError.mockRestore();
    vi.unstubAllGlobals();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('style');
    localStorage.clear();
  }
});
it('explains fallback storage instead of offering photos', () => {
  vi.mocked(isPhotoStorageAvailable).mockReturnValue(false);
  const html = renderToStaticMarkup(React.createElement(BackgroundPhotoSection, { background: { photos: [], meta: null, url: null, select: vi.fn(), add: vi.fn(), remove: vi.fn() } }));
  expect(html).toContain('Photos need browser storage, which is unavailable here.');
  expect(html).not.toContain('type="file"');
});
