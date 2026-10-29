import { useEffect, useState } from 'react';
import type { StandaloneNote } from '../../types/daymark';

/** Keep the editor stable independently of explicit navigation/highlight state. */
export function useShownNote(notes: StandaloneNote[], firstNoteId: string) {
  const [shownNoteId, setShownNoteId] = useState(firstNoteId);
  useEffect(() => {
    if (!notes.some(note => note.id === shownNoteId) && shownNoteId !== firstNoteId) setShownNoteId(firstNoteId);
  }, [notes, shownNoteId, firstNoteId]);
  return { shownNoteId, setShownNoteId };
}
