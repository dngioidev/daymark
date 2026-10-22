import React, { useEffect, useId, useMemo, useState } from 'react';
import type { DailyDocument, StandaloneNote, StatusDefinition } from '../types/daymark';
import { searchVault, type SearchResult } from '../utils/search';
import { formatDay } from '../utils/dateFormat';
import { Dialog } from './ui/Dialog';

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  docs: DailyDocument[];
  notes: StandaloneNote[];
  today: string;
  statuses: StatusDefinition[];
  onPick: (result: SearchResult) => void;
}

export const SearchDialog: React.FC<SearchDialogProps> = ({ isOpen, onClose, docs, notes, today, statuses, onPick }) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listId = useId();
  useEffect(() => {
    if (!isOpen) { setQuery(''); setDebouncedQuery(''); setSelected(0); return; }
    const timer = window.setTimeout(() => { setDebouncedQuery(query); setSelected(0); }, 120);
    return () => window.clearTimeout(timer);
  }, [query, isOpen]);
  const results = useMemo(() => searchVault(docs, notes, debouncedQuery), [docs, notes, debouncedQuery]);
  const active = Math.min(selected, Math.max(0, results.length - 1));
  const pick = (result: SearchResult) => { onClose(); onPick(result); };
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Search" size="lg">
      <div className="p-4 space-y-3">
        <label htmlFor={`${listId}-input`} className="sr-only">Search tasks and notes</label>
        <input
          id={`${listId}-input`} type="search" data-autofocus placeholder="Search tasks and notes"
          role="combobox" aria-autocomplete="list" aria-expanded={results.length > 0}
          aria-controls={listId} aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (results.length) setSelected((active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
            } else if (e.key === 'Enter' && results[active]) { e.preventDefault(); pick(results[active]); }
          }}
          className="w-full min-h-11 px-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
        />
        <div id={listId} role="listbox" aria-label="Search results" className="space-y-3">
          {(['task', 'note'] as const).map((kind) => {
            const matches = results.map((result, index) => ({ result, index })).filter(({ result }) => result.kind === kind);
            if (!matches.length) return null;
            return (
              <div key={kind} role="group" aria-labelledby={`${listId}-${kind}`}>
                <h3 id={`${listId}-${kind}`} className="text-sm font-semibold px-2 py-1">{kind === 'task' ? 'Tasks' : 'Notes'}</h3>
                {matches.map(({ result, index }) => (
                  <button key={result.kind === 'task' ? result.taskId : result.noteId}
                    id={`${listId}-${index}`} role="option" aria-selected={index === active} type="button"
                    onFocus={() => setSelected(index)} onClick={() => pick(result)}
                    className={`w-full text-left p-3 rounded-lg ${index === active ? 'bg-stone-200 dark:bg-stone-700' : 'hover:bg-stone-100 dark:hover:bg-stone-800'}`}>
                    <span className="block font-medium">{result.title || 'Untitled'}</span>
                    {result.kind === 'task' ? (
                      <span className="flex flex-wrap gap-2 items-center text-sm text-stone-700 dark:text-stone-300 mt-1">
                        <span>{formatDay(result.date, today)}</span>
                        <span className="px-2 py-0.5 rounded-full border border-stone-400 dark:border-stone-500">{statuses.find((status) => status.id === result.status)?.label ?? result.status}</span>
                        {result.archived && <span className="font-medium">Archived</span>}
                      </span>
                    ) : <span className="block text-sm text-stone-600 dark:text-stone-300 line-clamp-2 mt-1">{result.snippet}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        <p role="status" className="text-sm text-stone-600 dark:text-stone-400">
          {!query.trim() ? 'Search across every day and all notes.' : !results.length ? 'No results found.' : `${results.length} results. Use arrow keys and Enter to open.`}
        </p>
      </div>
    </Dialog>
  );
};
