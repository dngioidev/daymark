import { afterEach, beforeEach, expect, it } from 'vitest';
import type { PhotoMeta } from '../../types/daymark';
import { DEFAULT_APPEARANCE } from '../../utils/defaultData';
import { toEntities } from '../syncClient';
import { startSyncRig } from '../testkit/devices';

let rig: Awaited<ReturnType<typeof startSyncRig>>;
beforeEach(async () => { rig = await startSyncRig(); });
afterEach(async () => { await rig?.stop(); });

it('syncs appearance to a fresh device without exporting background files, metadata or selection', async () => {
  const a = rig.device('photo-owner');
  const b = rig.device('no-photo');
  const meta: PhotoMeta = { slot: 0, addedAt: '2026-10-30T08:00:00Z', luminance: 0.2, width: 800, height: 600 };
  const photo = new Blob(['device-only-photo'], { type: 'image/webp' });
  // These raw-store keys live outside VaultData. Even an over-inclusive snapshot
  // must not leak them into the entities sent to the server.
  const localPhotos = { bgMeta: [meta], 'ui:bgSlot': 0, 'bgPhoto:0': photo, 'bgThumb:0': photo };
  a.edit(v => ({ ...v, settings: { ...v.settings, appearance: {
    ...DEFAULT_APPEARANCE, theme: 'dark', dim: 45, blur: 6,
  } } }));
  const entities = toEntities({ ...a.vault, ...localPhotos });
  expect([...entities.keys()].sort()).toEqual([
    'backlog', 'doc:2026-10-24', 'habitday:2026-10-23', 'habitday:2026-10-24', 'habits', 'notemeta', 'settings',
  ]);
  const assertNoPhoto = (value: unknown): void => {
    expect(value).not.toBeInstanceOf(Blob);
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        expect(key).not.toMatch(/^(bgMeta|bgPhoto:.*|bgThumb:.*|ui:bgSlot)$/);
        assertNoPhoto(child);
      }
    }
  };
  for (const value of entities.values()) assertNoPhoto(value);
  await a.sync();
  const outcome = await b.sync();
  expect(b.vault.settings.appearance).toMatchObject({ theme: 'dark', dim: 45, blur: 6 });
  for (const [key, value] of outcome.serverValues) {
    expect(key).not.toMatch(/^(bgMeta|bgPhoto:.*|bgThumb:.*|ui:bgSlot)$/);
    assertNoPhoto(value);
  }
});
