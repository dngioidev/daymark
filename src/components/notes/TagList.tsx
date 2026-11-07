import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Hash } from 'lucide-react';
import type { TagRow } from '../../utils/noteTags';
import { tagKey } from '../../utils/noteTags';

export interface TagListProps {
  rows: TagRow[];
  activeTag?: string;
  onSelectTag(tag: string): void;
  compact?: boolean;
  /** Bumped by Help's Show me: expand, scroll into view and focus the first tag. */
  revealSignal?: number;
  /** Called after a reveal has been shown, so it is not repeated on a later mount. */
  onRevealed?(): void;
}

/** Tags section under the folder tree. Nested tags indent by `/`. */
export function TagList({ rows, activeTag, onSelectTag, compact, revealSignal, onRevealed }: TagListProps) {
  const [open, setOpen] = useState(true);
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!revealSignal) return;
    setOpen(true);
    requestAnimationFrame(() => {
      region.current?.scrollIntoView?.({ block: 'nearest' });
      (region.current?.querySelector<HTMLElement>('button[data-tag]') ?? region.current?.querySelector<HTMLElement>('button'))?.focus();
      onRevealed?.();
    });
  }, [revealSignal]);
  const active = activeTag ? tagKey(activeTag) : undefined;
  const height = compact ? 'min-h-11' : 'min-h-8';
  return <div ref={region} role="region" aria-label="Tags" data-tags-section className="shrink-0 max-h-[40%] overflow-y-auto border-t border-stone-200 dark:border-stone-800 px-1 pt-1">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className={`${height} w-full flex items-center gap-1 px-1 text-xs font-semibold text-stone-600 dark:text-stone-300`}>
      {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}Tags
    </button>
    {open && (rows.length ? <ul className="pb-1">{rows.map(row => {
      const pressed = active === tagKey(row.tag);
      return <li key={row.tag}><button type="button" data-tag={row.tag} aria-pressed={pressed} aria-label={`#${row.tag}, ${row.count} ${row.count === 1 ? 'note' : 'notes'}`}
        onClick={() => onSelectTag(row.tag)} style={{ paddingLeft: `${0.5 + row.depth}rem` }}
        className={`${height} w-full flex items-center gap-1 pr-2 rounded-lg text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800 ${pressed ? 'bg-stone-200 dark:bg-stone-700 font-semibold' : ''}`}>
        <Hash size={12} aria-hidden="true" className="shrink-0 text-stone-500" /><span className="min-w-0 flex-1 truncate">{row.name}</span><span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">{row.count}</span>
      </button></li>;
    })}</ul> : <p className="px-2 pb-2 text-xs text-stone-600 dark:text-stone-400">Type #word in a note to tag it.</p>)}
  </div>;
}
