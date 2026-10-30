import { expect, it } from 'vitest';
import { startSyncRig } from '../testkit/devices';
import { EditLedger, normalizeVault, randomEdit, seededRng } from '../testkit/randomEdits';

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
