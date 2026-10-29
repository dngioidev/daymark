import { useEffect, useMemo, useState } from 'react';
import { EMPTY_NOTE_META, type NoteMeta, type StandaloneNote } from '../../types/daymark';
import { ancestorPaths, defaultExpanded } from '../../utils/noteTree';
import { existingExpansionKeys, migrateNoteExpansion, pruneNoteExpansion } from '../../utils/noteExpansion';
import { loadNoteExpansion, saveNoteExpansion } from '../../utils/notesPanes';

/** Device preferences persist after commit; all state updaters stay pure. */
export function useNoteNavigationState(notes: StandaloneNote[], openNoteId: string, shownNoteId = openNoteId, meta: NoteMeta = EMPTY_NOTE_META) {
  const openFolder = notes.find(note => note.id === openNoteId)?.folder;
  const valid = useMemo(() => existingExpansionKeys(notes, meta), [notes, meta]);
  const [currentFolder, setCurrentFolder] = useState(openFolder ?? '');
  const [rawExpanded, setExpanded] = useState(() => pruneNoteExpansion(loadNoteExpansion() ?? defaultExpanded(notes, openNoteId || shownNoteId), valid));
  // Stale keys are hidden and not persisted, but kept in memory so Undo of a delete restores the folder expanded.
  const expanded = useMemo(() => pruneNoteExpansion(rawExpanded, valid), [rawExpanded, valid]);
  useEffect(() => { saveNoteExpansion(expanded); }, [expanded]);
  const revealFolder = (folder: string) => {
    setCurrentFolder(folder);
    setExpanded(previous => {
      const paths = ancestorPaths(folder);
      return paths.every(path => previous.has(path)) ? previous : new Set([...previous, ...paths]);
    });
  };
  const toggleExpanded = (path: string, open: boolean) => setExpanded(previous => {
    const next = new Set(previous); const key = ancestorPaths(path).at(-1) ?? '';
    if (open) next.add(key); else next.delete(key);
    return next;
  });
  const migrateFolderExpansion = (from: string, to?: string) => setExpanded(previous => migrateNoteExpansion(previous, from, to));
  useEffect(() => { if (openFolder !== undefined) revealFolder(openFolder); }, [openNoteId, openFolder]);
  return { currentFolder, setCurrentFolder, expanded, setExpanded, toggleExpanded, revealFolder, migrateFolderExpansion };
}
