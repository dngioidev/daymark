import { useState, useEffect, useCallback } from 'react';
import type { InkPage } from '../types/daymark';
import { readInkPages, saveInkPages } from '../utils/vaultStore';

/** App-owned ink state. Task 7 can pass these two page operations to its editor. */
export function useInkPages() {
  const [ink, setInk] = useState<InkPage[]>(readInkPages);
  useEffect(() => { saveInkPages(ink); }, [ink]);
  const inkPagesForNote = useCallback((noteId: string) =>
    ink.filter(page => page.noteId === noteId).sort((a, b) => a.page - b.page), [ink]);
  const updateInkPage = useCallback((page: InkPage) => {
    setInk(current => {
      const index = current.findIndex(p => p.noteId === page.noteId && p.page === page.page);
      return index < 0 ? [...current, page] : current.map((p, i) => i === index ? page : p);
    });
  }, []);
  return { ink, setInk, inkPagesForNote, updateInkPage };
}
