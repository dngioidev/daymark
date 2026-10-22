import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { BackgroundPhotoSection } from './BackgroundPhotoSection';
vi.mock('../../utils/vaultStore', () => ({ isPhotoStorageAvailable: vi.fn(() => true) }));
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
});
it('explains fallback storage instead of offering photos', () => {
  vi.mocked(isPhotoStorageAvailable).mockReturnValue(false);
  const html = renderToStaticMarkup(React.createElement(BackgroundPhotoSection, { background: { photos: [], meta: null, url: null, select: vi.fn(), add: vi.fn(), remove: vi.fn() } }));
  expect(html).toContain('Photos need browser storage, which is unavailable here.');
  expect(html).not.toContain('type="file"');
});
