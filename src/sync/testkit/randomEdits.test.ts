import { expect, it } from 'vitest';
import { startSyncRig } from './devices';
import { EditLedger, seededRng } from './randomEdits';

it('replays the same random sequence, with distinct seeds and bounded draws', () => {
  const draws = (seed: number) => { const rng = seededRng(seed); return Array.from({ length: 100 }, rng); };
  expect(draws(7)).toEqual(draws(7));
  expect(draws(7)).not.toEqual(draws(8));
  expect(draws(7).every(value => value >= 0 && value < 1)).toBe(true);
});

it('detects a missing last write and does not excuse it with a different field', async () => {
  const rig = await startSyncRig();
  try {
    const device = rig.device('A');
    const ledger = new EditLedger();
    const original = structuredClone(device.vault);
    ledger.edit(device, 'attention', v => { v.settings.agingThresholds.attentionDays = 12; });
    ledger.edit(device, 'critical', v => { v.settings.agingThresholds.criticalDays = 18; });
    expect(ledger.losses(original)).toHaveLength(2);
    expect(ledger.losses(device.vault)).toEqual([]);
    ledger.edit(device, 'attention again', v => { v.settings.agingThresholds.attentionDays = 15; });
    expect(ledger.losses(device.vault)).toEqual([]);
    expect(ledger.losses(original)).toHaveLength(3); // No surviving successor: all three are losses.
  } finally { await rig.stop(); }
});

it('accepts an edit defeating a concurrent deletion, but rejects unchanged resurrection', async () => {
  const rig = await startSyncRig();
  try {
    const a = rig.device('A'), b = rig.device('B');
    const ledger = new EditLedger();
    ledger.edit(a, 'add', v => { v.docs[0].headings = [{ name: 'Work', items: [{ id: 't', title: 'Original',
      status: 'not-started', heading: 'Work', order: 1, createdDate: '2026-10-24', originalNoteDate: '2026-10-24', historyLog: [] }] }]; });
    await ledger.sync(a); await ledger.sync(b);
    const unchanged = structuredClone(a.vault);
    ledger.edit(a, 'delete', v => { v.docs[0].headings[0].items = []; v.docs[0].removedTaskIds = ['t']; });
    expect(ledger.losses(unchanged)).toEqual([expect.objectContaining({ field: '$exists', value: false })]);
    ledger.edit(b, 'concurrent edit', v => { v.docs[0].headings[0].items[0].title = 'Edited'; });
    await ledger.sync(b); await ledger.sync(a); await ledger.sync(b);
    expect(ledger.losses(a.vault)).toEqual([]);
  } finally { await rig.stop(); }
});
