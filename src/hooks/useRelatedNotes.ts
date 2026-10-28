import { useEffect, useMemo, useState } from 'react';
import type { DismissedPair, StandaloneNote } from '../types/daymark';
import { buildNoteIndex, linksOf, pairKey, suggestRelated, type NoteIndex, type RelatedSuggestion } from '../utils/noteRelated';

export type RelatedNoteSuggestion = RelatedSuggestion & { note: StandaloneNote };

/** Only build the text index after typing stops. Keep the previous snapshot while waiting. */
export function useRelatedNotes(notes: StandaloneNote[], noteId: string, dismissed: DismissedPair[]) {
  const [snapshot, setSnapshot] = useState<{ index: NoteIndex; notes: StandaloneNote[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let idle: number | undefined;
    const timer = setTimeout(() => {
      const rebuild = () => { if (!cancelled) setSnapshot({ index: buildNoteIndex(notes), notes }); };
      if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(rebuild, { timeout: 1000 });
      else idle = window.setTimeout(rebuild, 0);
    }, 800);
    return () => {
      cancelled = true; clearTimeout(timer);
      if (idle !== undefined) {
        if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
        else window.clearTimeout(idle);
      }
    };
  }, [notes]);
  // This memo never runs for body keystrokes until the idle snapshot changes.
  return useMemo(() => {
    const hiddenKeys = new Set(dismissed.filter(pair => !pair.restored).map(pair => pair.key));
    const byId = new Map((snapshot?.notes ?? []).map(note => [note.id, note]));
    const resolve = (ids: string[]) => ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
    const links = snapshot ? linksOf(snapshot.index, noteId) : { outgoing: [], incoming: [] };
    const suggestions: RelatedNoteSuggestion[] = snapshot ? suggestRelated(snapshot.index, noteId, { dismissed: hiddenKeys })
      .map(suggestion => ({ ...suggestion, note: byId.get(suggestion.noteId)! })) : [];
    return { suggestions, linked: { outgoing: resolve(links.outgoing), incoming: resolve(links.incoming) },
      hidden: [...byId.values()].filter(note => note.id !== noteId && hiddenKeys.has(pairKey(noteId, note.id))) };
  }, [snapshot, noteId, dismissed]);
}
