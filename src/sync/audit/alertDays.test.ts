import { afterEach, beforeEach, expect, it } from 'vitest';
import { resolveAlertDays } from '../../utils/alertDays';
import { startSyncRig } from '../testkit/devices';

let rig: Awaited<ReturnType<typeof startSyncRig>>;
beforeEach(async () => { rig = await startSyncRig(); });
afterEach(async () => { await rig?.stop(); });

it('alertDays set on one device reaches another', async () => {
  const a = rig.device('a'), b = rig.device('b');
  await a.sync(); await b.sync();
  a.edit(v => ({ ...v, settings: { ...v.settings, alertDays: { tasks: 'weekdays', habits: 'weekend' } } }));
  await a.sync(); await b.sync();
  expect(b.vault.settings.alertDays).toEqual({ tasks: 'weekdays', habits: 'weekend' });
});

it('legacy device syncing does not reset the choice', async () => {
  const modern = rig.device('modern'), legacy = rig.device('legacy', { legacy: true });
  await modern.sync(); await legacy.sync();
  modern.edit(v => ({ ...v, settings: { ...v.settings, alertDays: { tasks: 'weekdays', habits: 'weekend' } } }));
  await modern.sync(); await legacy.sync();
  expect(legacy.vault.settings).not.toHaveProperty('alertDays');
  legacy.edit(v => ({ ...v, settings: { ...v.settings, agingThresholds: { ...v.settings.agingThresholds, attentionDays: 5 } } }));
  await legacy.sync(); await modern.sync();
  const fresh = rig.device('fresh'); await fresh.sync();
  for (const device of [modern, fresh]) {
    expect(device.vault.settings.alertDays).toEqual({ tasks: 'weekdays', habits: 'weekend' });
    expect(device.vault.settings.agingThresholds.attentionDays).toBe(5);
  }
});

it('an old-format device that never had alertDays still shows all week', async () => {
  const legacy = rig.device('legacy', { legacy: true }), modern = rig.device('modern');
  await legacy.sync(); await modern.sync(); await legacy.sync(); await modern.sync();
  for (const device of [legacy, modern]) {
    expect(device.vault.settings).not.toHaveProperty('alertDays');
    expect(resolveAlertDays(device.vault.settings)).toEqual({ tasks: 'all', habits: 'all' });
    expect(device.vault.settings).not.toHaveProperty('alertDays');
  }
});
