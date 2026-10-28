import type { StandaloneNote } from '../types/daymark';
import { pairKey, suggestRelated, type NoteIndex } from './noteRelated';
import type { GraphEdge } from './graphData';

export interface SuggestionProgress { edges: GraphEdge[]; pending: boolean; completed: number; batchMs: number }

/** Incremental, cancellable vault-wide scoring. Structural filters/search never
 * enter this job. Each idle task has a 12ms budget and publishes at most once.
 * While the canvas layout animates there is no idle period, so callbacks only
 * run at their (short) timeout; a timed-out callback still scores a full
 * bounded slice instead of one note per timeout, which used to starve the job
 * for seconds on a 1,000-note vault.
 * The top five are vault-wide; filtering may hide them rather than backfilling
 * weaker in-folder candidates (the existing suggestion contract). */
export function scheduleGraphSuggestions(notes: StandaloneNote[], index: NoteIndex, dismissed: Set<string>, publish: (progress: SuggestionProgress) => void): () => void {
  let cursor = 0, cancelled = false, idle: number | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const edges = new Map<string, GraphEdge>();
  const queue = () => {
    if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(batch, { timeout: 32 });
    else timer = setTimeout(() => batch(), 0);
  };
  function batch(deadline?: IdleDeadline) {
    if (cancelled) return;
    const start = performance.now();
    do {
      const note = notes[cursor++];
      if (note) for (const suggestion of suggestRelated(index, note.id, { dismissed })) {
        const key = pairKey(note.id, suggestion.noteId);
        if (!edges.has(key)) edges.set(key, { a: note.id, b: suggestion.noteId, kind: 'suggested', terms: suggestion.sharedTerms });
      }
    } while (cursor < notes.length && performance.now() - start < 12 && (!deadline || deadline.didTimeout || deadline.timeRemaining() > 1));
    const pending = cursor < notes.length;
    publish({ edges: [...edges.values()], pending, completed: Math.min(cursor, notes.length), batchMs: performance.now() - start });
    if (pending && !cancelled) queue();
  }
  queue();
  return () => { cancelled = true; if (idle !== undefined && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle); if (timer !== undefined) clearTimeout(timer); };
}
