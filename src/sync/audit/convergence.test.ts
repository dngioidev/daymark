import { expect, it } from 'vitest';
import { startSyncRig } from '../testkit/devices';
import { EditLedger, normalizeVault, randomEdit, seededRng } from '../testkit/randomEdits';
import { moveTaskToDate } from '../../utils/taskActions';
import { performDailyRollover } from '../../utils/lifecycleEngine';

// Fixed release gate: do not reduce either the seeds or the operation count.
const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
it.each(seeds)('converges without losing edits (seed %i)', async seed => {
  const rig = await startSyncRig();
  const ledger = new EditLedger();
  const rng = seededRng(seed);
  const devices = [rig.device('A'), rig.device('B'), rig.device('legacy', { legacy: true })];
  try {
    for (const device of devices) await ledger.sync(device);
    for (let op = 0; op < 60; op++) {
      const device = devices[Math.floor(rng() * devices.length)];
      const action = Math.floor(rng() * 10);
      if (action === 0 || action === 1) {
        device.online = action === 1;
        ledger.log.push(`${device.name} ${device.online ? 'online' : 'offline'}`);
      } else if (action < 4) {
        if (device.online) await ledger.sync(device);
        else {
          ledger.log.push(`${device.name} sync rejected offline`);
          await expect(device.sync()).rejects.toThrow('offline');
        }
      } else randomEdit(rng, device, ledger);
    }
    for (const device of devices) device.online = true;
    let settled = false;
    for (let round = 0; round < 6; round++) {
      // Shuffle deterministically; all requests are awaited, so submission order is known.
      const order = [...devices];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const outcomes = [];
      for (const device of order) outcomes.push(await ledger.sync(device));
      if (outcomes.every(outcome => outcome.pushed === 0) &&
          devices.every(device => normalizeVault(device.vault, { legacy: device.name === 'legacy' }) === normalizeVault(devices[0].vault, { legacy: device.name === 'legacy' }))) {
        settled = true;
        break;
      }
    }
    expect(settled, 'pending changes or unequal vaults after six rounds').toBe(true);
    expect(normalizeVault(devices[1].vault)).toBe(normalizeVault(devices[0].vault));
    expect(normalizeVault(devices[2].vault, { legacy: true })).toBe(normalizeVault(devices[0].vault, { legacy: true }));
    expect(ledger.losses(devices[0].vault)).toEqual([]);
  } catch (error) {
    throw new Error(`Seed ${seed}\n${ledger.log.join('\n')}\n${String(error)}`, { cause: error });
  } finally {
    await rig.stop();
  }
}, 15_000);

// Isolate this generated race so the original 25 random traces stay reproducible.
it.each(seeds)('converges an offline carry racing moved edits (seed %i)', async seed => {
  const rig = await startSyncRig();
  const devices = [rig.device('A'), rig.device('B'), rig.device('legacy', { legacy: true })];
  try {
    // Vary task identity, edit time and submission order deterministically.
    const [a, b, legacy] = devices;
    const id = `carry-race-${seed}`;
    const title = `Moved title ${seed}`;
    a.vault.docs[0].headings = [{ name: 'Work', items: [{ id, title: 'Original', status: 'in-progress',
      createdDate: '2026-10-24', originalNoteDate: '2026-10-24', heading: 'Work', order: 1, historyLog: [] }], notesContent: '' }];
    await a.sync(); await b.sync(); await legacy.sync();
    b.online = false;
    a.vault.docs = moveTaskToDate(a.vault.docs, id, '2026-10-24', '2026-10-26', ['Work'], `2026-10-24T09:00:${String(seed).padStart(2, '0')}Z`)!;
    Object.assign(a.vault.docs.find(d => d.date === '2026-10-26')!.headings[0].items[0], { title, status: 'blocked' });
    b.vault.docs = performDailyRollover('2026-10-25', b.vault.docs, b.vault.settings.statuses, ['Work']).updatedDocs;
    b.online = true;
    for (const device of seed % 2 ? [a, b] : [b, a]) await device.sync();
    for (const device of [a, b, legacy, a, b, legacy]) await device.sync();
    for (const device of devices) {
      const tasks = device.vault.docs.flatMap(d => d.headings.flatMap(h => h.items));
      expect(tasks).toEqual([expect.objectContaining({ id, title, status: 'blocked' })]);
    }
    expect(normalizeVault(devices[1].vault)).toBe(normalizeVault(devices[0].vault));
    expect(normalizeVault(devices[2].vault, { legacy: true })).toBe(normalizeVault(devices[0].vault, { legacy: true }));
  } finally { await rig.stop(); }
}, 15_000);
