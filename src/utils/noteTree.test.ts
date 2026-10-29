import { describe, expect, it } from 'vitest';
import { EMPTY_NOTE_META, type NoteMeta, type StandaloneNote } from '../types/daymark';
import { ancestorPaths, buildNoteTreeRows, defaultExpanded, noteTooltip, visibleRowKey, type NoteTreeRow } from './noteTree';

const now = '2026-10-29T08:00:00.000Z';
const note = (id: string, folder = '', patch: Partial<StandaloneNote> = {}): StandaloneNote => ({
  id, folder, title: id, content: '', tags: [], createdAt: now, updatedAt: now, ...patch,
});
const meta = (...paths: string[]): NoteMeta => ({ folders: paths.map(path => ({ path, updatedAt: now })), dismissed: [] });
const build = (notes: StandaloneNote[], options: Partial<Parameters<typeof buildNoteTreeRows>[0]> = {}) =>
  buildNoteTreeRows({ notes, meta: EMPTY_NOTE_META, expanded: new Set(), query: '', ...options });
const noteRows = (rows: NoteTreeRow[]) => rows.filter(row => row.kind === 'note');

describe('notes tree', () => {
  it('orders folders before notes, naturally and case/accent insensitively at every level', () => {
    const notes = [note('z', 'Zoo'), note('10', 'Work', { title: 'Note 10' }), note('2', 'Work', { title: 'note 2' }),
      note('e', 'Work', { title: 'Éclair' }), note('a', 'Work', { title: 'alpha' }), note('child', 'Work/Sub 10'), note('child2', 'work/Sub 2')];
    const { rows, matchCount } = build(notes, { expanded: new Set(['work', 'work/sub 2', 'work/sub 10', 'zoo']) });
    expect(rows.map(row => row.kind === 'folder' ? `${row.path}:${row.depth}` : row.kind === 'note' ? `${row.noteId}:${row.depth}` : row.kind)).toEqual([
      'Work:0', 'Work/Sub 2:1', 'child2:2', 'Work/Sub 10:1', 'child:2', 'a:1', 'e:1', '2:1', '10:1', 'Zoo:0', 'z:1',
    ]);
    expect(matchCount).toBe(7);
  });

  it('shows sorted pinned copies and counts each note once in its folder', () => {
    const { rows } = build([note('z', 'Work', { pinned: true }), note('a', 'Work', { pinned: true }), note('b', 'Work')], { expanded: new Set(['work']) });
    expect(rows[0]).toEqual({ kind: 'pinned-heading' });
    expect(noteRows(rows).map(row => [row.noteId, row.group, row.depth, row.pinned])).toEqual([
      ['a', 'pinned', 0, true], ['z', 'pinned', 0, true], ['a', 'tree', 1, true], ['b', 'tree', 1, false], ['z', 'tree', 1, true],
    ]);
    expect(rows.find(row => row.kind === 'folder')).toMatchObject({ ownNotes: 3, totalNotes: 3 });
    expect(new Set(rows.map(visibleRowKey)).size).toBe(rows.length);
  });

  it('puts unfiled notes last without a heading and displays Untitled', () => {
    const { rows } = build([note('z'), note('blank', '', { title: '' }), note('a'), note('child', 'Work')]);
    expect(rows.map(row => row.kind)).toEqual(['folder', 'note', 'note', 'note']);
    expect(noteRows(rows).map(row => [row.title, row.depth, row.group])).toEqual([['a', 0, 'tree'], ['Untitled', 0, 'tree'], ['z', 0, 'tree']]);
  });

  it('keeps empty metadata folders and counts hidden descendants of collapsed folders', () => {
    const { rows } = build([note('a', 'Work'), note('b', 'Work/Deep')], { meta: meta('Empty/Child'), expanded: new Set(['empty']) });
    expect(rows).toEqual([
      { kind: 'folder', path: 'Empty', name: 'Empty', depth: 0, expanded: true, ownNotes: 0, totalNotes: 0 },
      { kind: 'folder', path: 'Empty/Child', name: 'Child', depth: 1, expanded: false, ownNotes: 0, totalNotes: 0 },
      { kind: 'folder', path: 'Work', name: 'Work', depth: 0, expanded: false, ownNotes: 1, totalNotes: 2 },
    ]);
    expect(build([], { meta: meta('Empty') }).rows[0]).toMatchObject({ kind: 'folder', path: 'Empty' });
  });

  it('returns the empty-vault status only when there are neither notes nor live folders', () => {
    expect(build([])).toEqual({ rows: [{ kind: 'status', text: 'No notes yet. Create a note.' }], matchCount: 0 });
  });

  it('normalizes folder keys without changing display spelling', () => {
    const { rows } = build([note('a', ' Work / Deep '), note('b', 'work/deep')], { expanded: new Set(['work', 'work/deep']) });
    expect(noteRows(rows).map(row => row.noteId)).toEqual(['a', 'b']);
    expect(rows.filter(row => row.kind === 'folder').map(row => row.path)).toEqual(['Work', 'Work/Deep']);
  });

  it('filters title, raw body and tag substrings, expands ancestors and omits pinned copies and siblings', () => {
    const notes = [note('title', 'Work/Deep', { title: 'A NEEDLE needle', pinned: true }),
      note('body', 'Body', { content: 'before Needle after' }), note('tag', '', { tags: ['myNeedleTag'] }),
      note('hidden', 'Work/Deep'), note('other', 'Elsewhere')];
    const { rows, matchCount } = build(notes, { query: '  NeEdLe  ', meta: meta('Empty') });
    expect(matchCount).toBe(3);
    expect(rows.filter(row => row.kind === 'folder').map(row => [row.path, row.expanded])).toEqual([['Body', true], ['Work', true], ['Work/Deep', true]]);
    expect(noteRows(rows).map(row => [row.noteId, row.group])).toEqual([['body', 'tree'], ['title', 'tree'], ['tag', 'tree']]);
    expect(noteRows(rows).find(row => row.noteId === 'title')).toMatchObject({ pinned: true, titleMatch: [[2, 8], [9, 15]] });
    expect(noteRows(rows).find(row => row.noteId === 'body')?.snippet).toEqual({ before: 'before ', match: 'Needle', after: ' after' });
    expect(rows.some(row => row.kind === 'pinned-heading')).toBe(false);
  });

  it('uses substring matching without accent folding, regex interpretation or whitespace normalization', () => {
    expect(build([note('a', '', { title: 'Café' })], { query: 'cafe' }).matchCount).toBe(0);
    expect(build([note('a', '', { title: 'a.b' }), note('b', '', { title: 'axb' })], { query: '.' }).matchCount).toBe(1);
    expect(build([note('a', '', { content: 'one\n two' })], { query: 'one two' }).matchCount).toBe(0);
  });

  it('keeps highlight and snippet offsets in the original text when lowercase expands Unicode', () => {
    const notes = [note('title', '', { title: 'İ Needle' }), note('body', '', { content: 'İ Needle after' })];
    const rows = noteRows(build(notes, { query: 'needle' }).rows);
    expect(rows.find(row => row.noteId === 'title')?.titleMatch).toEqual([[2, 8]]);
    expect(rows.find(row => row.noteId === 'body')?.snippet).toEqual({ before: 'İ ', match: 'Needle', after: ' after' });
    expect(noteRows(build([note('a', '', { title: 'İ' })], { query: 'i' }).rows)[0].titleMatch).toEqual([[0, 1]]);
  });

  it('only supplies snippets for body-only matches, around the first match with collapsed whitespace', () => {
    const notes = [note('body', '', { content: `${'x'.repeat(80)}\n\tNeedle  end\n${'y'.repeat(80)} Needle` }),
      note('title', '', { title: 'Needle', content: 'Needle' }), note('tag', '', { tags: ['Needle'], content: 'Needle' })];
    const rows = noteRows(build(notes, { query: 'needle' }).rows);
    const snippet = rows.find(row => row.noteId === 'body')?.snippet;
    expect(snippet?.match).toBe('Needle');
    expect(snippet?.before).toMatch(/^x+ $/);
    expect(snippet?.after).toMatch(/^ end y+$/);
    expect(snippet!.before.length).toBeLessThanOrEqual(60);
    expect(snippet!.after.length).toBeLessThanOrEqual(60);
    expect(rows.find(row => row.noteId === 'title')?.snippet).toBeUndefined();
    expect(rows.find(row => row.noteId === 'tag')?.snippet).toBeUndefined();
  });

  it('retains a dimmed open note in its folder, without counting it or showing siblings', () => {
    const { rows, matchCount } = build([note('match', 'A', { title: 'needle' }), note('open', 'B/Deep', { pinned: true }), note('hidden', 'B/Deep')], { query: 'needle', openNoteId: 'open' });
    expect(matchCount).toBe(1);
    expect(noteRows(rows).map(row => [row.noteId, row.dimmed])).toEqual([['match', undefined], ['open', true]]);
    expect(rows.filter(row => row.kind === 'folder').map(row => [row.path, row.expanded])).toEqual([['A', true], ['B', true], ['B/Deep', true]]);
    expect(noteRows(rows)[1]).toMatchObject({ depth: 2, pinned: true, group: 'tree' });
  });

  it('counts a matching open note once without dimming it', () => {
    const { rows, matchCount } = build([note('a', '', { title: 'needle', pinned: true })], { query: 'needle', openNoteId: 'a' });
    expect(matchCount).toBe(1);
    expect(noteRows(rows)).toHaveLength(1);
    expect(noteRows(rows)[0].dimmed).toBeUndefined();
  });

  it('returns a no-match status with the trimmed query, but still keeps the open note reachable', () => {
    const notes = [note('open', 'Work/Deep')];
    expect(build(notes, { query: '  Absent  ' })).toEqual({ rows: [{ kind: 'status', text: 'No notes match “Absent”' }], matchCount: 0 });
    const result = build(notes, { query: 'Absent', openNoteId: 'open' });
    expect(result.rows).toContainEqual({ kind: 'status', text: 'No notes match “Absent”' });
    expect(noteRows(result.rows)[0]).toMatchObject({ noteId: 'open', dimmed: true });
    expect(result.matchCount).toBe(0);
  });

  it('treats blank search as no search and does not change expansion state during search', () => {
    const notes = [note('a', 'Work/Deep', { pinned: true })];
    const expanded = new Set(['work']);
    const original = build(notes, { expanded });
    expect(build(notes, { expanded, query: ' \n\t' })).toEqual(original);
    build(notes, { expanded, query: 'a' });
    expect(build(notes, { expanded })).toEqual(original);
    expect([...expanded]).toEqual(['work']);
  });

  it('is deterministic and never mutates notes, metadata or expansion inputs', () => {
    const notes = [note('z', 'Work'), note('a', 'Work', { tags: ['a'], pinned: true })];
    const data = meta('Empty');
    const snapshot = structuredClone({ notes, data });
    notes.forEach(n => { Object.freeze(n.tags); Object.freeze(n); });
    Object.freeze(notes);
    data.folders.forEach(Object.freeze);
    Object.freeze(data.folders);
    Object.freeze(data);
    const expanded = new Set(['work']);
    for (const query of ['', 'a']) {
      expect(build(notes, { meta: data, expanded, query })).toEqual(build(notes, { meta: data, expanded, query }));
    }
    expect({ notes, data }).toEqual(snapshot);
    expect([...expanded]).toEqual(['work']);
  });

  it('builds 1,000 notes in 50 folders in under 100 ms, including search', () => {
    const notes = Array.from({ length: 1000 }, (_, i) => note(`Note ${i}`, `Folder ${i % 50}`, { content: 'needle' }));
    const expanded = new Set(Array.from({ length: 50 }, (_, i) => `folder ${i}`));
    for (const query of ['', 'needle']) {
      const start = performance.now();
      const result = build(notes, { expanded, query });
      const elapsed = performance.now() - start;
      expect(result.rows).toHaveLength(1050);
      expect(result.matchCount).toBe(1000);
      expect(elapsed).toBeLessThan(100);
    }
  });
});

describe('notes tree helpers', () => {
  it('returns normalized inclusive ancestor paths as lowercase expansion keys', () => {
    expect(ancestorPaths(' / Work // Deep / Child / ')).toEqual(['work', 'work/deep', 'work/deep/child']);
    expect(ancestorPaths('')).toEqual([]);
  });

  it('defaults to top-level folders and the whole open note path only', () => {
    const notes = [note('open', 'Work/Deep/Child'), note('other', 'Elsewhere/Closed'), note('root')];
    expect([...defaultExpanded(notes, 'open')].sort()).toEqual(['elsewhere', 'work', 'work/deep', 'work/deep/child']);
    expect([...defaultExpanded(notes, 'missing')].sort()).toEqual(['elsewhere', 'work']);
    expect([...defaultExpanded(notes, 'root')].sort()).toEqual(['elsewhere', 'work']);
    expect([...defaultExpanded([], undefined)]).toEqual([]);
  });

  it('gives stable keys to folders, pinned copies, notes, headings and status rows', () => {
    const rows = build([note('a', 'Work', { pinned: true })], { expanded: new Set(['work']) }).rows;
    expect(rows.map(visibleRowKey)).toEqual(['pinned-heading', 'note:a:pinned', 'folder:work', 'note:a']);
    expect(visibleRowKey({ kind: 'status', text: 'anything' })).toBe('status');
  });

  it('formats last-edited tooltips with the existing date conventions', () => {
    expect(noteTooltip(note('a'), '2026-10-29')).toBe('Last edited Today');
    expect(noteTooltip(note('a', '', { updatedAt: '2026-10-28T08:00:00.000Z' }), '2026-10-29')).toBe('Last edited Yesterday');
    const localDate = new Date(2026, 9, 16).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, '');
    expect(noteTooltip(note('a', '', { updatedAt: '2026-10-16T08:00:00.000Z' }), '2026-10-29')).toBe(`Last edited ${localDate}`);
  });
});
