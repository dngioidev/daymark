import { afterEach, beforeEach, expect, it } from 'vitest';
import type { StandaloneNote } from '../../types/daymark';
import { buildFolderTree, deleteFolder, folderMatches, moveNote, renameFolder } from '../../utils/noteFolders';
import { startSyncRig, type Device } from '../testkit/devices';

const early = '2026-10-24T09:00:00Z';
const late = '2026-10-24T10:00:00Z';
const note: StandaloneNote = { id: 'note', title: 'Notes', folder: '', content: 'Original text', tags: [], createdAt: early, updatedAt: early };
let rig: Awaited<ReturnType<typeof startSyncRig>>;
let a: Device;
let b: Device;
beforeEach(async () => {
  rig = await startSyncRig(); a = rig.device('A'); b = rig.device('B');
  a.edit(v => ({ ...v, notes: [note], notemeta: { folders: [{ path: 'Work', updatedAt: early }], dismissed: [] } }));
  await a.sync(); await b.sync();
});
afterEach(async () => { await rig?.stop(); });
async function converge() {
  await a.sync(); await b.sync(); await a.sync(); await b.sync();
  expect(a.vault.notes).toEqual(b.vault.notes);
  expect(a.vault.notemeta).toEqual(b.vault.notemeta);
}

it.each(['content', 'folder', 'tags'] as const)('note deletion loses to a concurrent %s edit', async field => {
  a.edit(v => ({ ...v, notes: [] }));
  b.edit(v => ({ ...v, notes: v.notes.map(n => ({ ...n, [field]: field === 'tags' ? ['important'] : field === 'folder' ? 'Work' : 'Edited text', updatedAt: late })) }));
  await converge();
  expect(a.vault.notes).toHaveLength(1);
  expect(a.vault.notes[0][field]).toEqual(field === 'tags' ? ['important'] : field === 'folder' ? 'Work' : 'Edited text');
});

it('keeps server text and a visible conflict copy for concurrent note edits', async () => {
  a.edit(v => ({ ...v, notes: [{ ...note, content: 'Text from A', updatedAt: early }] }));
  b.edit(v => ({ ...v, notes: [{ ...note, content: 'Text from B', updatedAt: late }] }));
  await a.sync();
  const result = await b.sync();
  expect(result.conflicts.length).toBeGreaterThan(0);
  await converge();
  expect(a.vault.notes).toHaveLength(2);
  expect(a.vault.notes.find(n => n.id === 'note')?.content).toBe('Text from A');
  expect(a.vault.notes.find(n => n.title.endsWith('(conflict copy)'))?.content).toBe('Text from B');
});

it('retains a long offline edit after several syncs by the other device', async () => {
  a.online = false;
  a.edit(v => ({ ...v, notes: [{ ...note, content: 'Offline draft A', updatedAt: early }] }));
  for (const content of ['B first draft', 'B second draft', 'B final draft']) {
    b.edit(v => ({ ...v, notes: v.notes.map(n => ({ ...n, content, updatedAt: late })) }));
    await b.sync();
  }
  a.online = true;
  await converge();
  expect(a.vault.notes.map(n => n.content).sort()).toEqual(['B final draft', 'Offline draft A']);
});

it('keeps a concurrent move into a renamed folder visible and reachable', async () => {
  a.edit(v => { const renamed = renameFolder(v.notes, v.notemeta!, 'Work', 'Projects', late)!;
    return { ...v, notes: renamed.notes, notemeta: renamed.meta }; });
  b.edit(v => ({ ...v, notes: moveNote(v.notes, 'note', 'Work', late) }));
  await converge();
  expect(a.vault.notes).toHaveLength(1);
  expect(a.vault.notes[0]).toMatchObject({ content: 'Original text', folder: 'Work' });
  expect(buildFolderTree(a.vault.notes, a.vault.notemeta!)).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: 'Projects' }), expect.objectContaining({ path: 'Work', totalCount: 1 }),
  ]));
  expect(folderMatches(a.vault.notes[0], 'Work')).toBe(true);
});

it('keeps note and folder reachable when moving into a concurrently deleted folder', async () => {
  a.edit(v => ({ ...v, notes: moveNote(v.notes, 'note', 'Work', late) }));
  b.edit(v => { const deleted = deleteFolder(v.notes, v.notemeta!, 'Work', late);
    return { ...v, notes: deleted.notes, notemeta: deleted.meta }; });
  await converge();
  expect(a.vault.notes).toHaveLength(1);
  expect(a.vault.notes[0]).toMatchObject({ content: 'Original text', folder: 'Work' });
  expect(buildFolderTree(a.vault.notes, a.vault.notemeta!)).toEqual([
    expect.objectContaining({ path: 'Work', ownCount: 1, totalCount: 1 }),
  ]);
  expect(folderMatches(a.vault.notes[0], 'Work')).toBe(true);
});

it('keeps existing notes and an incoming note reachable during a populated folder rename', async () => {
  a.edit(v => ({ ...v, notes: [...v.notes, { ...note, id: 'existing', content: 'Existing text', folder: 'Work' }, { ...note, id: 'nested', content: 'Nested text', folder: 'Work/Sub' }] }));
  await a.sync(); await b.sync();
  a.edit(v => { const renamed = renameFolder(v.notes, v.notemeta, 'Work', 'Projects', late)!;
    return { ...v, notes: renamed.notes, notemeta: renamed.meta }; });
  b.edit(v => ({ ...v, notes: moveNote(v.notes, 'note', 'Work', late) }));
  await converge();
  expect(a.vault.notes).toHaveLength(3);
  expect(a.vault.notes).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'existing', content: 'Existing text', folder: 'Projects' }),
    expect.objectContaining({ id: 'nested', content: 'Nested text', folder: 'Projects/Sub' }),
    expect.objectContaining({ id: 'note', content: 'Original text', folder: 'Work' }),
  ]));
  const tree = buildFolderTree(a.vault.notes, a.vault.notemeta);
  expect(tree).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: 'Projects', totalCount: 2, children: expect.arrayContaining([expect.objectContaining({ path: 'Projects/Sub', ownCount: 1 })]) }),
    expect.objectContaining({ path: 'Work', ownCount: 1 }),
  ]));
  for (const n of a.vault.notes) expect(folderMatches(n, n.folder)).toBe(true);
});
