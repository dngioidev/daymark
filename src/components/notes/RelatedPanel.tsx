import React from 'react';
import type { StandaloneNote } from '../../types/daymark';
import type { RelatedNoteSuggestion } from '../../hooks/useRelatedNotes';
import { canLinkToTitle } from '../../utils/noteRelated';

export interface RelatedPanelProps {
  suggestions: RelatedNoteSuggestion[];
  linked: { outgoing: StandaloneNote[]; incoming: StandaloneNote[] };
  hidden: StandaloneNote[];
  onLink(noteId: string): void;
  onDismiss(noteId: string): void;
  onRestore(noteId: string): void;
  onOpen(noteId: string): void;
  minimized: boolean;
  onToggleMinimized(): void;
}
const action = 'min-h-11 min-w-11 px-3 rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed';

export function RelatedContents({ suggestions, linked, hidden, onLink, onDismiss, onRestore, onOpen }: Omit<RelatedPanelProps, 'minimized' | 'onToggleMinimized'>) {
  const openNote = (note: StandaloneNote) => <button type="button" className="min-h-11 w-full text-left font-medium break-words hover:underline" onClick={() => onOpen(note.id)}>{note.title || 'Untitled'}</button>;
  return <div className="space-y-4 p-3 text-sm text-stone-900 dark:text-stone-100">
    <section aria-label="Suggested notes">
      <h3 className="font-semibold">Suggested</h3>
      {!suggestions.length && <p className="py-2 text-stone-600 dark:text-stone-400">No suggestions yet.</p>}
      <ul className="space-y-3">{suggestions.map(({ note, sharedTerms }) => <li key={note.id}>
        {openNote(note)}
        <p className="text-xs text-stone-600 dark:text-stone-400 break-words">shares: {sharedTerms.join(', ')}</p>
        <div className="flex flex-wrap gap-2 mt-2">
          <button type="button" className={action} disabled={!canLinkToTitle(note.title)} aria-describedby={!canLinkToTitle(note.title) ? `related-unsafe-${note.id}` : undefined} onClick={() => onLink(note.id)}>Link</button>
          <button type="button" className={action} onClick={() => onDismiss(note.id)}>Not related</button>
        </div>
        {!canLinkToTitle(note.title) && <p id={`related-unsafe-${note.id}`} className="mt-1 text-xs text-stone-600 dark:text-stone-400">Rename this note to remove unsupported link characters.</p>}
      </li>)}</ul>
    </section>
    <section aria-label="Linked notes"><h3 className="font-semibold">Linked</h3>
      {(['outgoing', 'incoming'] as const).map(direction => <div key={direction}><h4 className="mt-2 text-xs text-stone-600 dark:text-stone-400">{direction === 'outgoing' ? 'Outgoing' : 'Incoming'}</h4>
        <ul>{linked[direction].map(note => <li key={note.id}>{openNote(note)}</li>)}</ul>
      </div>)}
    </section>
    <details><summary className="min-h-11 flex items-center cursor-pointer font-medium">Hidden suggestions ({hidden.length})</summary>
      <ul>{hidden.map(note => <li key={note.id}>{openNote(note)}<button type="button" className={action} onClick={() => onRestore(note.id)}>Restore</button></li>)}</ul>
    </details>
  </div>;
}

export function RelatedPanel(props: RelatedPanelProps) {
  return <aside aria-label={props.minimized ? 'Related minimized' : 'Related panel'} className={`${props.minimized ? 'w-14' : 'w-64'} shrink-0 min-h-0 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100`}>
    <button type="button" className="min-h-11 w-full px-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800" aria-label={props.minimized ? 'Expand Related' : 'Minimize Related'} onClick={props.onToggleMinimized}>
      {props.minimized ? <><span aria-hidden="true">&gt;</span><span className="block rounded-full bg-stone-200 dark:bg-stone-700 mx-auto w-8">{props.suggestions.length}</span></> : 'Related <'}
    </button>
    {!props.minimized && <RelatedContents {...props} />}
  </aside>;
}
