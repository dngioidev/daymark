import { afterEach, beforeEach, expect, it } from 'vitest';
import { startSyncRig } from '../testkit/devices';

let rig: Awaited<ReturnType<typeof startSyncRig>>;
beforeEach(async () => { rig = await startSyncRig(); });
afterEach(async () => { await rig?.stop(); });

it('legacy device pushes back without erasing alertDays', async () => {
  const a = rig.device('a');
  const l = rig.device('l', { legacy: true });
  a.edit(v => ({ ...v, settings: { ...v.settings, alertDays: { tasks: 'weekdays', habits: 'all' } } }));
  await a.sync();
  await l.sync();
  expect(l.vault.settings).not.toHaveProperty('alertDays');
  l.edit(v => ({ ...v, settings: { ...v.settings, agingThresholds: { ...v.settings.agingThresholds, attentionDays: 5 } } }));
  await l.sync();
  await a.sync();
  expect(a.vault.settings).toMatchObject({ alertDays: { tasks: 'weekdays', habits: 'all' }, agingThresholds: { attentionDays: 5 } });
  const c = rig.device('c');
  await c.sync();
  expect(c.vault.settings).toMatchObject({ alertDays: { tasks: 'weekdays', habits: 'all' }, agingThresholds: { attentionDays: 5 } });
});
