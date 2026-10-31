import { expect, it } from 'vitest';
import { startSyncRig } from '../testkit/devices';
import { moveTaskToDate } from '../../utils/taskActions';
import { performDailyRollover } from '../../utils/lifecycleEngine';
import { resetTab } from '../../components/settings/useInstantSettings';
import { normalizeVault } from '../testkit/randomEdits';

it.each([false, true])('keeps moved edits against an offline unedited carry (carry first: %s)', async carryFirst => {
  const rig = await startSyncRig();
  try {
    const a = rig.device('A'), b = rig.device('B');
    a.vault.docs[0].headings = [{ name: 'Work', notesContent: '', items: [{ id: 'X', title: 'Original', status: 'in-progress', createdDate: '2026-10-24', originalNoteDate: '2026-10-24', heading: 'Work', order: 1, historyLog: [] }] }];
    await a.sync(); await b.sync();
    b.online = false;
    a.vault.docs = moveTaskToDate(a.vault.docs, 'X', '2026-10-24', '2026-10-26', ['Work'], '2026-10-24T09:00:00Z')!;
    const moved = a.vault.docs.find(d => d.date === '2026-10-26')!.headings[0].items[0];
    moved.title = 'Renamed after move'; moved.status = 'blocked';
    b.vault.docs = performDailyRollover('2026-10-25', b.vault.docs, b.vault.settings.statuses, ['Work']).updatedDocs;
    b.online = true;
    if (carryFirst) { await b.sync(); await a.sync(); } else { await a.sync(); await b.sync(); }
    for (let i = 0; i < 3; i++) { await a.sync(); await b.sync(); }
    const tasks = a.vault.docs.flatMap(d => d.headings.flatMap(h => h.items.map(t => ({ date: d.date, task: t }))));
    expect(tasks).toEqual([{ date: '2026-10-26', task: expect.objectContaining({ id: 'X', title: 'Renamed after move', status: 'blocked' }) }]);
    expect(normalizeVault(a.vault)).toBe(normalizeVault(b.vault));
    const c = rig.device('C'); await c.sync();
    expect(normalizeVault(c.vault)).toBe(normalizeVault(a.vault));
  } finally { await rig.stop(); }
});

it('propagates an explicit aging reset and keeps it through another sync', async () => {
  const rig = await startSyncRig();
  try {
    const a = rig.device('A'), b = rig.device('B');
    a.vault.settings.alertDays = { tasks: 'weekdays', habits: 'weekend' };
    await a.sync(); await b.sync();
    a.vault.settings = resetTab('aging', a.vault.settings);
    await a.sync(); await b.sync(); await a.sync();
    expect(a.vault.settings.alertDays).toEqual({ tasks: 'all', habits: 'all' });
    expect(b.vault.settings.alertDays).toEqual({ tasks: 'all', habits: 'all' });
  } finally { await rig.stop(); }
});
