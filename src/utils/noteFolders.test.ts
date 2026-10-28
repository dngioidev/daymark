import { describe, expect, it } from 'vitest';
import { EMPTY_NOTE_META, type NoteMeta, type StandaloneNote } from '../types/daymark';
import { buildFolderTree, createFolder, deleteFolder, exportFolderPath, folderMatches, moveFolder, moveNote, normalizeFolderPath, renameFolder } from './noteFolders';

const before = '2026-10-27T08:00:00.000Z';
const now = '2026-10-28T08:00:00.000Z';
const note = (id: string, folder: string): StandaloneNote => ({ id, folder, title: id, content: 'Keep content', tags: ['keep'], createdAt: before, updatedAt: before });
const meta = (...paths: string[]): NoteMeta => ({ folders: paths.map(path => ({ path, updatedAt: before })), dismissed: [{ key: 'a|b', at: before }] });

describe('note folders', () => {
  it.each([[' Tech / Java ', 'Tech/Java'], ['//a//b/', 'a/b'], ['', '']])('normalizes %j', (input, expected) => {
    expect(normalizeFolderPath(input)).toBe(expected);
  });

  it('keeps legacy folders top-level, sorts siblings, and excludes root notes from folder counts', () => {
    expect(buildFolderTree([note('w', 'Work'), note('g', 'General'), note('g2', 'General'), note('root', '')], EMPTY_NOTE_META)).toEqual([
      { path: 'General', name: 'General', ownCount: 2, totalCount: 2, children: [] },
      { path: 'Work', name: 'Work', ownCount: 1, totalCount: 1, children: [] },
    ]);
  });

  it('rolls nested counts up and uses first-seen spelling for shared ancestors', () => {
    expect(buildFolderTree([note('a', 'Tech/Java/x'), note('b', 'tech/java'), note('c', 'Tech')], meta('tech/Empty'))).toEqual([
      { path: 'Tech', name: 'Tech', ownCount: 1, totalCount: 3, children: [
        { path: 'Tech/Empty', name: 'Empty', ownCount: 0, totalCount: 0, children: [] },
        { path: 'Tech/Java', name: 'Java', ownCount: 1, totalCount: 2, children: [
          { path: 'Tech/Java/x', name: 'x', ownCount: 1, totalCount: 1, children: [] },
        ] },
      ] },
    ]);
  });

  it('omits removed folders unless needed by notes and includes empty live ancestors', () => {
    const data = meta('Gone', 'Used', 'Empty/Child');
    data.folders[0].removed = data.folders[1].removed = true;
    expect(buildFolderTree([note('a', 'Used/Sub')], data).map(n => n.path)).toEqual(['Empty', 'Used']);
    expect(buildFolderTree([], data).map(n => n.path)).toEqual(['Empty']);
  });

  it('creates normalized empty folders, avoids case duplicates and restores tombstones immutably', () => {
    const data = meta('Tech');
    data.folders[0].removed = true;
    const restored = createFolder(data, ' tech ', now);
    expect(restored.folders).toEqual([{ path: 'Tech', updatedAt: now }]);
    expect(createFolder(restored, 'TECH', now).folders).toHaveLength(1);
    expect(createFolder(EMPTY_NOTE_META, ' New / Empty ', now).folders).toEqual([{ path: 'New/Empty', updatedAt: now }]);
    expect(createFolder(data, '', now)).toEqual(data);
    expect(data.folders[0].removed).toBe(true);
    expect(EMPTY_NOTE_META.folders).toEqual([]);
  });

  it('renames only the matching prefix on notes and metadata without changing inputs', () => {
    const notes = [note('a', 'Tech/Java/x'), note('b', 'Techno'), note('c', 'tech')];
    const data = meta('Tech', 'Tech/Java', 'Tech/Empty', 'Other');
    const snapshot = structuredClone({ notes, data });
    const result = renameFolder(notes, data, ' Tech ', ' Dev ', now)!;
    expect(result.notes.map(n => n.folder)).toEqual(['Dev/Java/x', 'Techno', 'Dev']);
    expect(result.notes[0]).toEqual({ ...notes[0], folder: 'Dev/Java/x', updatedAt: now });
    expect(result.notes[1]).toBe(notes[1]);
    expect(result.meta.folders.map(f => f.path)).toEqual(['Dev', 'Dev/Java', 'Dev/Empty', 'Other']);
    expect(result.meta.folders[1].updatedAt).toBe(now);
    expect(result.meta.dismissed).toBe(data.dismissed);
    expect({ notes, data }).toEqual(snapshot);
  });

  it('merges into an existing case-insensitive destination without duplicating notes or folders', () => {
    const notes = [note('a', 'Tech/Java'), note('b', 'dev/java'), note('c', 'dev')];
    const result = renameFolder(notes, meta('Tech', 'Tech/Java', 'dev', 'dev/java'), 'Tech', 'Dev', now)!;
    expect(result.notes.map(n => [n.id, n.folder])).toEqual([['a', 'dev/java'], ['b', 'dev/java'], ['c', 'dev']]);
    expect(result.meta.folders.map(f => f.path).sort()).toEqual(['dev', 'dev/java']);
    expect(result.notes[1]).toBe(notes[1]);
  });

  it.each(['Tech/Java', 'tech/java/x', 'TECH'])('rejects renaming Tech to %s', target => {
    expect(renameFolder([note('a', 'Tech')], meta('Tech'), 'Tech', target, now)).toBeNull();
  });

  it('moves a folder under another folder or back to root via rename semantics', () => {
    const notes = [note('a', 'Tech/Java/x')];
    const result = moveFolder(notes, meta('Tech/Java'), 'Tech/Java', 'Work', now)!;
    expect(result.notes[0].folder).toBe('Work/Java/x');
    expect(result.meta.folders[0].path).toBe('Work/Java');
    expect(moveFolder(result.notes, result.meta, 'Work/Java', '', now)!.notes[0].folder).toBe('Java/x');
    expect(moveFolder(notes, meta(), 'Tech', 'Tech/Java', now)).toBeNull();
  });

  it('deletes a subtree by moving all notes to its parent and tombstoning folders', () => {
    const notes = [note('a', 'Tech/Java'), note('b', 'tech/java/x'), note('c', 'Tech/JavaScript')];
    const data = meta('Tech/Java', 'Tech/Java/x', 'Other');
    const snapshot = structuredClone({ notes, data });
    const result = deleteFolder(notes, data, 'Tech/Java', now);
    expect(result.notes.map(n => n.folder)).toEqual(['Tech', 'Tech', 'Tech/JavaScript']);
    expect(result.notes[0]).toEqual({ ...notes[0], folder: 'Tech', updatedAt: now });
    expect(result.notes[2]).toBe(notes[2]);
    expect(result.meta.folders).toEqual([
      { path: 'Tech/Java', updatedAt: now, removed: true },
      { path: 'Tech/Java/x', updatedAt: now, removed: true },
      data.folders[2],
    ]);
    expect({ notes, data }).toEqual(snapshot);
  });

  it('deletes a note-only top-level folder without losing notes and records inferred tombstones', () => {
    const result = deleteFolder([note('a', 'Tech/Java/x')], EMPTY_NOTE_META, 'Tech', now);
    expect(result.notes).toEqual([{ ...note('a', 'Tech/Java/x'), folder: '', updatedAt: now }]);
    expect(result.meta.folders).toEqual(['Tech', 'Tech/Java', 'Tech/Java/x'].map(path => ({ path, updatedAt: now, removed: true })));
    expect(deleteFolder(result.notes, result.meta, '', now)).toEqual(result);
  });

  it('moves only the selected note and preserves all its content and metadata', () => {
    const notes = [note('a', 'Tech'), note('b', 'Work')];
    const result = moveNote(notes, 'a', ' New / Sub ', now);
    expect(result[0]).toEqual({ ...notes[0], folder: 'New/Sub', updatedAt: now });
    expect(result[1]).toBe(notes[1]);
    expect(notes[0].folder).toBe('Tech');
    expect(moveNote(notes, 'missing', '', now)).toEqual(notes);
  });

  it('exports directories with canonical ancestor spelling and illegal characters replaced', () => {
    expect([...exportFolderPath([note('a', 'Tech/Java'), note('b', 'tech/java'), note('c', 'tech/Other'), note('d', 'A:B/Q?*'), note('e', '')])]).toEqual([
      ['a', 'Tech/Java'], ['b', 'Tech/Java'], ['c', 'Tech/Other'], ['d', 'A_B/Q__'], ['e', ''],
    ]);
  });

  it('matches exact folders and descendants case-insensitively at segment boundaries', () => {
    expect(folderMatches(note('a', 'Tech/Java'), ' tech ')).toBe(true);
    expect(folderMatches(note('a', 'Tech'), 'TECH')).toBe(true);
    expect(folderMatches(note('a', 'Techno'), 'Tech')).toBe(false);
    expect(folderMatches(note('a', 'Tech'), 'Tech/Java')).toBe(false);
    expect(folderMatches(note('a', 'Tech'), '')).toBe(true);
  });
});
