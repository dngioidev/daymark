import { createContext } from 'react';
import type { InkPage } from '../types/daymark';

/**
 * Live ink pages, outside React state. A stroke commit updates this store and persists at once;
 * only the open notebook subscribes, so writing does not re-render the whole App.
 */
export interface InkStore {
  get(): InkPage[];
  set(pages: InkPage[]): void;
  /** Replaces the page with the same note and number, or adds it. Returns true when added. */
  upsert(page: InkPage): boolean;
  subscribe(listener: () => void): () => void;
  /** This note's pages by page number; the same array until one of them changes. */
  pagesFor(noteId: string): InkPage[];
}

export function createInkStore(initial: InkPage[]): InkStore {
  let pages = initial;
  const listeners = new Set<() => void>();
  const byNote = new Map<string, InkPage[]>();
  let indexed: InkPage[] | null = null;
  const notify = () => { for (const listener of [...listeners]) listener(); };
  return {
    get: () => pages,
    set(next) { if (next !== pages) { pages = next; notify(); } },
    upsert(page) {
      const index = pages.findIndex(p => p.noteId === page.noteId && p.page === page.page);
      if (index >= 0 && pages[index] === page) return false;
      pages = index < 0 ? [...pages, page] : pages.map((p, i) => i === index ? page : p);
      notify();
      return index < 0;
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    pagesFor(noteId) {
      if (indexed !== pages) {
        indexed = pages;
        const grouped = new Map<string, InkPage[]>();
        for (const page of pages) grouped.set(page.noteId, [...grouped.get(page.noteId) ?? [], page]);
        for (const [id, list] of grouped) {
          list.sort((a, b) => a.page - b.page);
          const previous = byNote.get(id);
          if (!previous || previous.length !== list.length || previous.some((p, i) => p !== list[i])) byNote.set(id, list);
        }
        for (const id of byNote.keys()) if (!grouped.has(id)) byNote.delete(id);
      }
      return byNote.get(noteId) ?? EMPTY;
    },
  };
}

const EMPTY: InkPage[] = [];

/** Provided by App; without it, HandwrittenNoteView uses its `pages` prop. */
export const InkStoreContext = createContext<InkStore | null>(null);
