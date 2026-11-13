import { createContext, useContext } from 'react';

/** Lets any Markdown preview open the note a `[[link]]` points to without threading props through every view. */
export interface NoteLinks {
  /** Opens the linked note; returns false when no note matches. */
  open(link: string): boolean;
  exists(link: string): boolean;
}

export const NoteLinkContext = createContext<NoteLinks | null>(null);

export const useNoteLinks = (): NoteLinks | null => useContext(NoteLinkContext);
