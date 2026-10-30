import { expect, it } from 'vitest';
import { startSyncRig } from './testkit/devices';

it('converges after a device stamps its backlog edit a year ahead', async () => {
  const rig = await startSyncRig();
  try {
    const a = rig.device('A');
    const b = rig.device('B');
    const past = new Date(Date.now() - 60_000).toISOString();
    a.edit(v => ({ ...v, backlog: { items: [{ id: 'a', title: 'Base', order: 1, createdAt: past, updatedAt: past }] } }));
    await a.sync();
    await b.sync();
    const future = new Date(Date.now() + 365 * 86_400_000).toISOString();
    a.edit(v => ({ ...v, backlog: { items: [{ ...v.backlog.items[0], title: 'Wrong clock', updatedAt: future }] } }));
    b.edit(v => ({ ...v, backlog: { items: [{ ...v.backlog.items[0], title: 'Correct clock', updatedAt: new Date().toISOString() }] } }));
    await a.sync();
    const result = await b.sync();
    expect(result.conflicts).toHaveLength(1);
    expect(b.vault.backlog.items[0].title).toBe('Correct clock');
    await a.sync();
    await b.sync();
    expect(a.vault).toEqual(b.vault);
    expect(a.vault.backlog.items[0].title).toBe('Correct clock');
  } finally {
    await rig.stop();
  }
}, 20_000);
