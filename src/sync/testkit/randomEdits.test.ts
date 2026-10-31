import { expect, it, vi } from 'vitest';
import { startSyncRig } from './devices';
import { EditLedger, seededRng } from './randomEdits';

it.each(['matching', 'bare title', 'wrong field', 'wrong entity', 'content only', 'earlier sync'] as const)(
  'requires matching note metadata conflict evidence in the resolving sync: %s', async evidence => {
    const rig = await startSyncRig();
    try {
      const a = rig.device('A'), b = rig.device('B');
      const ledger = new EditLedger();
      ledger.edit(a, 'create note', v => { v.notes = [{ id: 'note-one', title: 'Shared title', folder: 'Work', content: 'Intact', tags: [], createdAt: '2026-10-24T08:00:00Z', updatedAt: '2026-10-24T08:00:00Z' }]; });
      await ledger.sync(a); await ledger.sync(b);
      ledger.edit(b, 'older folder', v => { v.notes[0].folder = 'Phone'; v.notes[0].updatedAt = '2026-10-24T09:00:00Z'; });
      ledger.edit(a, 'newer folder', v => { v.notes[0].folder = 'Desktop'; v.notes[0].updatedAt = '2026-10-24T10:00:00Z'; });
      await ledger.sync(b);
      if (evidence === 'earlier sync') await a.sync();
      const realSync = a.sync.bind(a);
      vi.spyOn(a, 'sync').mockImplementation(async opts => {
        const outcome = await realSync(opts);
        const messages: Partial<Record<typeof evidence, string>> = {
          'bare title': 'Note "Shared title": field "folder" was changed on two devices; kept the latest change',
          'wrong field': 'Note "Shared title" (id: note-one): field "title" was changed on two devices; kept the latest change',
          'wrong entity': 'Note "Shared title" (id: note-two): field "folder" was changed on two devices; kept the latest change',
          'content only': 'Note "Shared title" was edited on two devices; the other version was saved as "Shared title (conflict copy)"',
        };
        return messages[evidence] ? { ...outcome, conflicts: [messages[evidence]!] } : outcome;
      });
      await ledger.sync(a);
      expect(a.vault.notes).toEqual([expect.objectContaining({ id: 'note-one', folder: 'Desktop', content: 'Intact' })]);
      if (evidence === 'matching') expect(ledger.losses(a.vault)).toEqual([]);
      else expect(ledger.losses(a.vault)).toContainEqual(expect.objectContaining({ entity: 'note:note-one', field: 'folder', value: 'Phone' }));
    } finally { vi.restoreAllMocks(); await rig.stop(); }
  });

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

it('counts a merged edit at the moved location as survival and rejects stale, duplicate, missing or unedited replacements', async () => {
  const { moveTaskToDate } = await import('../../utils/taskActions');
  const rig = await startSyncRig();
  try {
    const a = rig.device('A'), b = rig.device('B');
    const ledger = new EditLedger();
    ledger.edit(a, 'add', v => { v.docs[0].headings = [{ name: 'Work', items: [{ id: 't', title: 'Original', status: 'not-started', heading: 'Work', order: 1, createdDate: '2026-10-24', originalNoteDate: '2026-10-24', historyLog: [] }] }]; });
    await ledger.sync(a); await ledger.sync(b);
    ledger.edit(a, 'move', v => { v.docs = moveTaskToDate(v.docs, 't', '2026-10-24', '2026-10-25', ['Work'], '2026-10-24T09:00:00Z')!; });
    ledger.edit(b, 'edit', v => { v.docs[0].headings[0].items[0].title = 'Edited'; });
    const stale = structuredClone(b.vault);
    await ledger.sync(a); await ledger.sync(b); await ledger.sync(a);
    expect(ledger.losses(a.vault)).toEqual([]);
    expect(ledger.losses(stale)).toContainEqual(expect.objectContaining({ field: '$date', value: '2026-10-25' }));
    const duplicate = structuredClone(a.vault); duplicate.docs.push(stale.docs[0]);
    expect(ledger.losses(duplicate).length).toBeGreaterThan(0);
    const missing = structuredClone(a.vault); missing.docs = [];
    expect(ledger.losses(missing).length).toBeGreaterThan(0);
    const unedited = structuredClone(a.vault); unedited.docs.find(d => d.date === '2026-10-25')!.headings[0].items[0].title = 'Original';
    expect(ledger.losses(unedited)).toContainEqual(expect.objectContaining({ field: 'title', value: 'Edited' }));
  } finally { await rig.stop(); }
});
