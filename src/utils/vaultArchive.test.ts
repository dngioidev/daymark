import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { DEFAULT_SETTINGS, SEED_DAILY_DOCUMENTS, SEED_STANDALONE_NOTES } from './defaultData';
import { buildVaultZip, importVaultFromZip } from './vaultArchive';

describe('vault ZIP export/import', () => {
  it('round-trips a Daymark export exactly', async () => {
    const bytes = await buildVaultZip(SEED_DAILY_DOCUMENTS, SEED_STANDALONE_NOTES, DEFAULT_SETTINGS);
    const restored = await importVaultFromZip(bytes);
    expect(restored.docs).toEqual(SEED_DAILY_DOCUMENTS);
    expect(restored.notes).toEqual(SEED_STANDALONE_NOTES);
    expect(restored.settings).toEqual(DEFAULT_SETTINGS);
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
