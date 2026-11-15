import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { DEFAULT_SETTINGS, SEED_DAILY_DOCUMENTS, SEED_STANDALONE_NOTES } from './defaultData';
import { buildVaultZip, importVaultFromZip, mergeRestoredEvents, mergeRestoredHabits } from './vaultArchive';
import type { EventItem, HabitData } from '../types/daymark';
import { serializeEvent } from './eventMarkdown';

const habits: HabitData = {
  habits: [{ id: 'read', name: 'Read', order: 0, warnAfterDays: 3, addedOn: '2026-10-24', updatedAt: '2026-10-24T10:00:00Z' }],
  days: [{ date: '2026-10-24', ticks: { read: { done: true, at: '2026-10-24T10:00:00Z' } } }],
};

const event: EventItem = {
  id: 'event-2026-11-20-a', title: 'Launch review', date: '2026-11-20', heading: 'Work', order: 2,
  description: 'Bring the [draft].', checklist: [{ id: 'check-1', text: 'Prepare [demo]', done: true }],
  timing: { localTime: '15:00', timeZone: 'Asia/Ho_Chi_Minh', startInstant: '2026-11-20T08:00:00.000Z' },
  durationMinutes: 90, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z',
};

it('missing backup events preserve current data, invalid events fail, and explicit empty replaces', () => {
  const current = [event];
  expect(mergeRestoredEvents(current, undefined)).toBe(current);
  expect(() => mergeRestoredEvents(current, [null])).toThrow(/damaged.*event/i);
  const empty: EventItem[] = [];
  expect(mergeRestoredEvents(current, empty)).toBe(empty);
});

it('old JSON snapshots keep local events while explicit empty snapshots replace them', async () => {
  const old = new JSZip();
  old.file('Daymark/.daymark/vault.json', JSON.stringify({ daily_documents: [], standalone_notes: [] }));
  const legacy = await importVaultFromZip(await old.generateAsync({ type: 'uint8array' }));
  const current = [event];
  expect(legacy.events).toBeUndefined();
  expect(mergeRestoredEvents(current, legacy.events)).toBe(current);

  old.file('Daymark/.daymark/vault.json', JSON.stringify({ daily_documents: [], standalone_notes: [], events: [] }));
  const explicitEmpty = await importVaultFromZip(await old.generateAsync({ type: 'uint8array' }));
  expect(mergeRestoredEvents(current, explicitEmpty.events)).toEqual([]);
});

it('rejects malformed or duplicate event arrays in JSON snapshots', async () => {
  const zip = new JSZip();
  for (const events of [null, [event, event], [{ ...event, id: '../unsafe' }]]) {
    zip.file('Daymark/.daymark/vault.json', JSON.stringify({ daily_documents: [], standalone_notes: [], events }));
    await expect(importVaultFromZip(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/damaged.*event/i);
  }
});

it('ZIP round-trips event JSON and includes readable independent event Markdown', async () => {
  const bytes = await buildVaultZip([], [], DEFAULT_SETTINGS, undefined, undefined, undefined, undefined, [], [event]);
  const restored = await importVaultFromZip(bytes);
  expect(restored.events).toEqual([event]);
  const zip = await JSZip.loadAsync(bytes);
  const markdown = await zip.file(`Daymark/events/${event.id}.md`)!.async('string');
  expect(markdown).toContain('# Launch review');
  expect(markdown).toContain('**Date:** 2026-11-20');
});

it('snapshot ZIP import uses readable event edits instead of stale snapshot notes/checklist', async () => {
  const zip = await JSZip.loadAsync(await buildVaultZip([], [], DEFAULT_SETTINGS, undefined, undefined, undefined, undefined, [], [event]));
  const path = `Daymark/events/${event.id}.md`;
  const markdown = serializeEvent(event);
  const noteAt = markdown.lastIndexOf('Bring the [draft].');
  zip.file(path, markdown.slice(0, noteAt).concat('Updated visible note.', markdown.slice(noteAt + 'Bring the [draft].'.length))
    .replace('- [x] Prepare [demo]', '- [ ] Prepare [demo]'));
  const restored = await importVaultFromZip(await zip.generateAsync({ type: 'uint8array' }));
  expect(restored.events?.[0].description).toBe('Updated visible note.');
  expect(restored.events?.[0].checklist?.[0]).toEqual({ id: 'check-1', text: 'Prepare [demo]', done: false });
});

it('snapshot-less ZIP imports event-only backups and verifies path identity', async () => {
  const zip = new JSZip();
  zip.file(`Vault/events/${event.id}.md`, serializeEvent(event));
  expect((await importVaultFromZip(await zip.generateAsync({ type: 'uint8array' }))).events).toEqual([event]);

  const mismatched = new JSZip();
  mismatched.file('Vault/events/another-id.md', serializeEvent(event));
  await expect(importVaultFromZip(await mismatched.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/event.*filename|filename.*event/i);
});

it('does not treat Markdown files inside Notes/events folders as event files', async () => {
  const zip = new JSZip();
  zip.file('Vault/Notes/events/Shopping.md', 'grocery list');
  zip.file('Vault/Notes/Work/events/Meeting.md', 'meeting notes');
  zip.file('Vault/Other/events/not-an-event.md', 'unrelated markdown');
  const restored = await importVaultFromZip(await zip.generateAsync({ type: 'uint8array' }));
  expect(restored.events).toBeUndefined();
  expect(restored.notes.map(note => ({ title: note.title, folder: note.folder, content: note.content }))).toEqual([
    { title: 'Shopping', folder: 'events', content: 'grocery list' },
    { title: 'Meeting', folder: 'Work/events', content: 'meeting notes' },
  ]);
});

it('rejects malformed and duplicate event backup entries before replacement', async () => {
  const malformed = new JSZip();
  malformed.file('Vault/events/event.md', 'not an event file');
  await expect(importVaultFromZip(await malformed.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/event/i);

  const duplicate = new JSZip();
  duplicate.file('Vault/events/one.md', serializeEvent(event));
  duplicate.file('Vault/events/two.md', serializeEvent(event));
  await expect(importVaultFromZip(await duplicate.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/duplicate|filename|event/i);
});

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

const backlog = { items: [
  { id: 'u', title: 'Unsorted idea', order: 1, createdAt: 'now', updatedAt: 'now' },
  { id: 'b', title: 'Second', category: 'Ideas', order: 2, createdAt: 'now', updatedAt: 'now' },
  { id: 'a', title: 'First', category: ' ideas ', order: 1, createdAt: 'now', updatedAt: 'now', description: 'Details', tags: ['tag'], checklist: [{ id: 'c', text: 'Step', done: true }] },
  { id: 'z', title: 'Other', category: 'Work', order: 1, createdAt: 'now', updatedAt: 'now' },
  { id: 'p', title: 'Picked', category: 'Ideas', order: 0, createdAt: 'now', updatedAt: 'now', pickedOn: '2026-10-26' },
  { id: 'd', title: 'Deleted', order: 0, createdAt: 'now', updatedAt: 'now', deletedAt: 'now' },
] };
it('ZIP snapshot restores full backlog including tombstones and metadata', async () => {
  const bytes = await buildVaultZip([], [], DEFAULT_SETTINGS, undefined, undefined, backlog);
  expect((await importVaultFromZip(bytes)).backlog).toEqual(backlog);
});
it('Backlog.md groups visible items by normalized category, manual order, Unsorted last', async () => {
  const zip = await JSZip.loadAsync(await buildVaultZip([], [], DEFAULT_SETTINGS, undefined, undefined, backlog));
  expect(await zip.file('Daymark/Backlog.md')!.async('string')).toBe('## ideas\n\n- [ ] First\n- [ ] Second\n\n## Work\n\n- [ ] Other\n\n## Unsorted\n\n- [ ] Unsorted idea\n');
});
it('older ZIP and invalid backlog preserve current data; explicit empty replaces it', async () => {
  const { mergeRestoredBacklog } = await import('./vaultArchive');
  const old = new JSZip();
  old.file('Daymark/.daymark/vault.json', JSON.stringify({ daily_documents: [], standalone_notes: [] }));
  const restored = await importVaultFromZip(await old.generateAsync({ type: 'uint8array' }));
  expect(mergeRestoredBacklog(backlog, restored.backlog)).toBe(backlog);
  expect(mergeRestoredBacklog(backlog, { items: [null] })).toBe(backlog);
  const empty = { items: [] };
  expect(mergeRestoredBacklog(backlog, empty)).toBe(empty);
  old.file('Daymark/.daymark/vault.json', JSON.stringify({ daily_documents: [], standalone_notes: [], backlog: { items: [null] } }));
  expect((await importVaultFromZip(await old.generateAsync({ type: 'uint8array' }))).backlog).toBeUndefined();
});

const notemeta = { folders: [{ path: 'Tech/Empty', updatedAt: 'now' }, { path: 'Gone', updatedAt: 'now', removed: true }], dismissed: [{ key: 'a|b', at: 'now' }] };
it('ZIP round-trips note metadata including empty folders and tombstones', async () => {
  const bytes = await buildVaultZip([], [], DEFAULT_SETTINGS, undefined, undefined, undefined, notemeta);
  expect((await importVaultFromZip(bytes)).notemeta).toEqual(notemeta);
  const zip = await JSZip.loadAsync(bytes);
  expect(zip.files['Daymark/Notes/Tech/Empty/']?.dir).toBe(true);
  expect(zip.files['Daymark/Notes/Gone/']).toBeUndefined();
});
it('empty metadata folders share the notes canonical safe directory spelling', async () => {
  const notes = [{ ...SEED_STANDALONE_NOTES[0], folder: 'A:B/Java' }];
  const data = { folders: [{ path: 'a_b/java/Empty.', updatedAt: 'now' }], dismissed: [] };
  const zip = await JSZip.loadAsync(await buildVaultZip([], notes, DEFAULT_SETTINGS, undefined, undefined, undefined, data));
  expect(zip.files['Daymark/Notes/A_B/Java/Empty/']?.dir).toBe(true);
});
it('old or invalid backup metadata keeps current; explicit empty replaces', async () => {
  const { mergeRestoredNoteMeta } = await import('./vaultArchive');
  for (const value of [undefined, { folders: [null], dismissed: [] }]) {
    const zip = new JSZip();
    zip.file('Daymark/.daymark/vault.json', JSON.stringify({ daily_documents: [], standalone_notes: [], notemeta: value }));
    const restored = await importVaultFromZip(await zip.generateAsync({ type: 'uint8array' }));
    expect(restored.notemeta).toBeUndefined();
    expect(mergeRestoredNoteMeta(notemeta, restored.notemeta)).toBe(notemeta);
    expect(mergeRestoredNoteMeta(notemeta, value)).toBe(notemeta);
  }
  const empty = { folders: [], dismissed: [] };
  expect(mergeRestoredNoteMeta(notemeta, empty)).toBe(empty);
});
it('ZIP uses nested canonical safe directories and case-insensitive unique filenames', async () => {
  const paths = ['Tech/Java', 'tech/java', 'A:B', 'a_B', '../CON', '', 'Tech/Java'];
  const titles = ['Same', 'same', 'X', 'X', 'NUL', 'Root', 'Same (2)'];
  const notes = paths.map((folder, i) => ({ ...SEED_STANDALONE_NOTES[0], id: String(i), folder, title: titles[i], content: 'body-' + i }));
  const zip = await JSZip.loadAsync(await buildVaultZip([], notes, DEFAULT_SETTINGS));
  const names = Object.keys(zip.files).filter(n => n.startsWith('Daymark/Notes/') && n.endsWith('.md'));
  expect(names).toEqual(['Daymark/Notes/Tech/Java/Same.md', 'Daymark/Notes/Tech/Java/same (2).md',
    'Daymark/Notes/A_B/X.md', 'Daymark/Notes/A_B/X (2).md', 'Daymark/Notes/_/_CON/_NUL.md',
    'Daymark/Notes/Root.md', 'Daymark/Notes/Tech/Java/Same (2) (2).md']);
  for (let i = 0; i < names.length; i++) expect(await zip.file(names[i])!.async('string')).toBe('body-' + i);
});

it('round-trips ink and note markers exactly with a per-note ZIP sidecar', async () => {
  const note = { ...SEED_STANDALONE_NOTES[0], id: 'study', kind: 'handwritten' as const, paper: 'grid' as const };
  const ink = [0, 1].map(page => ({ noteId: note.id, page, strokes: [{ id: 's' + page, tool: 'pen' as const, color: '#000', width: 2, points: 'AAAA', createdAt: 'now' }], removed: ['old'], updatedAt: 'now' }));
  const bytes = await buildVaultZip([], [note], DEFAULT_SETTINGS, undefined, undefined, undefined, undefined, ink);
  const zip = await JSZip.loadAsync(bytes);
  expect(JSON.parse(await zip.file('Daymark/ink/study.json')!.async('string'))).toEqual(ink);
  const restored = await importVaultFromZip(bytes);
  expect(restored.ink).toEqual(ink);
  expect(restored.notes).toEqual([note]);
});
