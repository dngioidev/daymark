import { useState, useCallback, useRef } from 'react';
import type { InkPage } from '../types/daymark';
import { readInkPages, saveInkPages } from '../utils/vaultStore';
import { createInkStore } from '../ink/inkStore';

/** Writing pause after which App sees stroke edits (and so schedules its debounced sync). */
export const INK_APP_REFRESH_MS = 2000;

/**
 * App-owned ink. The live pages are in `inkStore`; every edit is persisted immediately.
 * `ink` is App's React snapshot: replaced at once by setInk and when a page is added, but
 * refreshed only after a writing pause for stroke edits, so a stroke does not re-render App.
 * Readers that need the latest pages (sync, backup, restore) use `inkStore.get()`.
 */
export function useInkPages() {
  const [inkStore] = useState(() => createInkStore(readInkPages()));
  const [ink, setSnapshot] = useState(inkStore.get);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refresh = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    setSnapshot(inkStore.get());
  }, [inkStore]);
  const setInk = useCallback((next: InkPage[] | ((current: InkPage[]) => InkPage[])) => {
    inkStore.set(typeof next === 'function' ? next(inkStore.get()) : next);
    saveInkPages(inkStore.get());
    refresh();
  }, [inkStore, refresh]);
  const updateInkPage = useCallback((page: InkPage) => {
    const added = inkStore.upsert(page);
    saveInkPages(inkStore.get());
    if (added) { refresh(); return; }
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(refresh, INK_APP_REFRESH_MS);
  }, [inkStore, refresh]);
  // Reads the live store; its identity follows the snapshot so memoized readers refresh with App.
  const inkPagesForNote = useCallback((noteId: string) => inkStore.pagesFor(noteId), [inkStore, ink]);
  return { ink, setInk, inkPagesForNote, updateInkPage, inkStore };
}
