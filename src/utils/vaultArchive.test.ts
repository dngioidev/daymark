import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { DEFAULT_SETTINGS, SEED_DAILY_DOCUMENTS, SEED_STANDALONE_NOTES } from './defaultData';
import { buildVaultZip, importVaultFromZip, mergeRestoredHabits } from './vaultArchive';
import type { HabitData } from '../types/daymark';

const habits: HabitData = {
  habits: [{ id: 'read', name: 'Read', order: 0, warnAfterDays: 3, addedOn: '2026-10-24', updatedAt: '2026-10-24T10:00:00Z' }],
  days: [{ date: '2026-10-24', ticks: { read: { done: true, at: '2026-10-24T10:00:00Z' } } }],
};

it('zip export/import round-trips habits', async () => {
  const bytes = await buildVaultZip([], [], DEFAULT_SETTINGS, habits);
  expect((await importVaultFromZip(bytes)).habits).toEqual(habits);
});

it('import without habits keeps current habits', async () => {
  const restored = await importVaultFromZip(await buildVaultZip([], [], DEFAULT_SETTINGS));
  expect(mergeRestoredHabits(habits, restored.habits)).toBe(habits);
});

it('import with habits replaces current habits, including an empty list', () => {
  const empty = { habits: [], days: [] };
  expect(mergeRestoredHabits(habits, empty)).toBe(empty);
});

it('ignores damaged backup habits so existing habits survive restore', async () => {
  const zip = new JSZip();
  zip.file('Daymark/.daymark/vault.json', JSON.stringify({ daily_documents: [], standalone_notes: [], habits: { habits: 'bad', days: [] } }));
  const restored = await importVaultFromZip(await zip.generateAsync({ type: 'uint8array' }));
  expect(restored.habits).toBeUndefined();
  expect(mergeRestoredHabits(habits, restored.habits)).toBe(habits);
});

describe('vault ZIP export/import', () => {
  it('round-trips a Daymark export exactly', async () => {
    const bytes = await buildVaultZip(SEED_DAILY_DOCUMENTS, SEED_STANDALONE_NOTES, DEFAULT_SETTINGS);
    const restored = await importVaultFromZip(bytes);
    expect(restored.docs).toEqual(SEED_DAILY_DOCUMENTS);
    expect(restored.notes).toEqual(SEED_STANDALONE_NOTES);
    expect(restored.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('rejects a snapshot with damaged days instead of importing it', async () => {
    const zip = new JSZip();
    zip.file('Daymark/.daymark/vault.json', JSON.stringify({ daily_documents: [{ foo: 1 }], standalone_notes: [] }));
    await expect(importVaultFromZip(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/damaged/i);
  });

  it('exports Obsidian-style markdown files alongside the snapshot', async () => {
    const bytes = await buildVaultZip(SEED_DAILY_DOCUMENTS, SEED_STANDALONE_NOTES, DEFAULT_SETTINGS);
    const names = Object.keys((await JSZip.loadAsync(bytes)).files);
    expect(names.some((n) => /Daymark\/Daily\/2026\/10-October\/2026-10-16\.md$/.test(n))).toBe(true);
    expect(names.some((n) => n.startsWith('Daymark/Notes/'))).toBe(true);
  });

  it('falls back to markdown when there is no snapshot (external vault)', async () => {
    const zip = new JSZip();
    zip.file('MyVault/Daily/2026/10-October/2026-10-16.md', '# Work\n\n- [ ] from obsidian\n');
    zip.file('MyVault/Notes/Ideas/Big idea.md', 'hello');
    const restored = await importVaultFromZip(await zip.generateAsync({ type: 'uint8array' }));
    expect(restored.docs).toHaveLength(1);
    expect(restored.docs[0].headings.find((h) => h.name === 'Work')!.items[0].title).toBe('from obsidian');
    expect(restored.notes[0]).toMatchObject({ title: 'Big idea', folder: 'Ideas', content: 'hello' });
  });

  it('rejects a ZIP with nothing importable', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'nope');
    await expect(importVaultFromZip(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/No Daymark/);
  });

  it('keeps notes with identical titles from overwriting each other', async () => {
    const notes = [
      { ...SEED_STANDALONE_NOTES[0], id: 'n1', title: 'Same', folder: 'A', content: 'one' },
      { ...SEED_STANDALONE_NOTES[0], id: 'n2', title: 'Same', folder: 'A', content: 'two' },
    ];
    const names = Object.keys((await JSZip.loadAsync(await buildVaultZip([], notes, DEFAULT_SETTINGS))).files);
    expect(names.filter((n) => n.includes('Notes/A/') && n.endsWith('.md'))).toHaveLength(2);
  });
});
