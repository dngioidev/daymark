import { useEffect, useState } from 'react';
import type { StandaloneNote } from '../../types/daymark';
import { ancestorPaths, defaultExpanded } from '../../utils/noteTree';
import { loadNoteExpansion, saveNoteExpansion } from '../../utils/notesPanes';

/** Navigation preferences never mutate or persist vault notes. */
export function useNoteNavigationState(notes: StandaloneNote[], openNoteId: string) {
  const openFolder = notes.find(note => note.id === openNoteId)?.folder ?? '';
  const [currentFolder, setCurrentFolder] = useState(openFolder);
  const [expanded, updateExpanded] = useState(() => loadNoteExpansion() ?? defaultExpanded(notes, openNoteId));
  const setExpanded = (next: Set<string>) => { updateExpanded(next); saveNoteExpansion(next); };
  const revealFolder = (folder: string) => {
    setCurrentFolder(folder);
    updateExpanded(previous => {
      const paths = ancestorPaths(folder);
      if (paths.every(path => previous.has(path))) return previous;
      const next = new Set([...previous, ...paths]); saveNoteExpansion(next); return next;
    });
  };
  useEffect(() => { revealFolder(openFolder); }, [openNoteId, openFolder]);
  return { currentFolder, setCurrentFolder, expanded, setExpanded, revealFolder };
}
