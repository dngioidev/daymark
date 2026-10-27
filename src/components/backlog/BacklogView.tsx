import React, { useId, useState } from 'react';
import type { BacklogData, BacklogItem } from '../../types/daymark';
import { visibleBacklog } from '../../utils/backlog';
import { getMoveTaskDateError } from '../../utils/taskActions';
import { buttonClass } from '../ui/Dialog';
import { showToast } from '../ui/feedback';

type BacklogInput = Pick<BacklogItem, 'title' | 'description' | 'category'>;
export interface BacklogViewProps {
  hideTitle?: boolean;
  compact?: boolean;
  backlog: BacklogData;
  today: string;
  headings: string[];
  onAdd: (input: BacklogInput) => void;
  onEdit: (id: string, patch: Partial<BacklogInput>) => void;
  onRemove: (id: string) => void;
  onRestore: (id: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
  onPick: (id: string, date: string) => void;
}

const field = 'min-h-11 px-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 min-w-0';

function BacklogRow({ item, today, compact, listId, first, last, onEdit, onRemove, onRestore, onReorder, onPick }: Pick<BacklogViewProps, 'today' | 'compact' | 'onEdit' | 'onRemove' | 'onRestore' | 'onReorder' | 'onPick'> & { item: BacklogItem; listId: string; first: boolean; last: boolean }) {
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  const [category, setCategory] = useState(item.category ?? '');
  const id = useId();
  return <li className="p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-3">
    {editing ? <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      if (!title.trim()) return;
      onEdit(item.id, { title: title.trim(), description: description.trim() || undefined, category: category.trim() || undefined });
      setEditing(false);
    }}>
      <label className="block text-sm font-medium" htmlFor={`${id}-title`}>Task</label>
      <input id={`${id}-title`} className={`${field} w-full`} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <label className="block text-sm font-medium" htmlFor={`${id}-category`}>Category (optional)</label>
      <input id={`${id}-category`} className={`${field} w-full`} list={listId} value={category} onChange={(e) => setCategory(e.target.value)} />
      <label className="block text-sm font-medium" htmlFor={`${id}-notes`}>Notes</label>
      <textarea id={`${id}-notes`} className={`${field} w-full py-2`} value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="flex gap-2"><button className={buttonClass.primary} disabled={!title.trim()}>Save</button><button type="button" className={buttonClass.ghost} onClick={() => setEditing(false)}>Cancel</button></div>
    </form> : <div>
      <p className="font-medium break-words">{item.title}</p>
      {item.description && <p className="text-sm whitespace-pre-wrap break-words text-stone-600 dark:text-stone-400 mt-1">{item.description}</p>}
    </div>}
    <div className={compact ? 'flex flex-col gap-3' : 'flex flex-wrap items-end justify-between gap-3'}>
      <form noValidate className={`flex gap-2 ${compact ? 'flex-col w-full' : 'flex-wrap items-end'}`} onSubmit={(e) => {
        e.preventDefault();
        const problem = getMoveTaskDateError(date, '', today);
        setError(problem);
        if (!problem) onPick(item.id, date);
      }}>
        <div className={compact ? 'w-full' : undefined}><label htmlFor={`${id}-date`} className="block text-sm font-medium mb-1">Pick a day</label>
          <input id={`${id}-date`} type="date" min={today} value={date} onChange={(e) => {
            setDate(e.target.value); setError(getMoveTaskDateError(e.target.value, '', today));
          }} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} className={`${field} [color-scheme:light] dark:[color-scheme:dark]${compact ? ' w-full' : ''}`} />
        </div>
        <button className={buttonClass.secondary}>Add to day</button>
        {error && <p id={`${id}-error`} role="alert" className="w-full text-sm text-stone-700 dark:text-stone-300">{error}</p>}
      </form>
      <div className="flex flex-wrap gap-1" aria-label={`Actions for ${item.title}`}>
        <button type="button" className={buttonClass.ghost} onClick={() => { setTitle(item.title); setCategory(item.category ?? ''); setDescription(item.description ?? ''); setEditing(true); }}>Edit</button>
        <button type="button" className={buttonClass.ghost} disabled={first} aria-label={`Move ${item.title} up`} onClick={() => onReorder(item.id, 'up')}>Up</button>
        <button type="button" className={buttonClass.ghost} disabled={last} aria-label={`Move ${item.title} down`} onClick={() => onReorder(item.id, 'down')}>Down</button>
        <button type="button" className={buttonClass.ghost} onClick={() => {
          onRemove(item.id);
          showToast('Removed from backlog.', { action: { label: 'Undo', onClick: () => onRestore(item.id) } });
        }}>Delete</button>
      </div>
    </div>
  </li>;
}

export const BacklogView: React.FC<BacklogViewProps> = ({ hideTitle = false, compact = false, backlog, today, headings, onAdd, ...actions }) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const id = useId();
  const items = visibleBacklog(backlog);
  const suggestions = [...new Set([...items.map((i) => i.category?.trim()).filter((c): c is string => !!c), ...headings])];
  const groups = new Map<string, { label: string; items: BacklogItem[] }>();
  for (const item of items) {
    const key = item.category?.trim().toLowerCase() ?? '';
    if (!groups.has(key)) groups.set(key, { label: item.category?.trim() || 'Unlabelled', items: [] });
    groups.get(key)!.items.push(item);
  }
  return <div className={`w-full mx-auto space-y-6 ${compact ? 'py-3 [&_button]:min-h-[44px] [&_button]:min-w-[44px] [&_input]:min-h-[44px] [&_textarea]:min-h-[44px]' : 'max-w-[1800px] px-4 sm:px-6 lg:px-8 py-6'}`}>
    {!hideTitle && <h1 className="text-2xl font-bold">Backlog</h1>}
    <form className={`flex gap-3 ${compact ? 'flex-col' : 'flex-wrap items-end'}`} onSubmit={(e) => {
      e.preventDefault();
      if (!title.trim()) return;
      onAdd({ title: title.trim(), category: category.trim() || undefined });
      setTitle('');
    }}>
      <div className={compact ? 'w-full min-w-0' : 'flex-1 min-w-48'}><label htmlFor={`${id}-title`} className="block text-sm font-medium mb-1">New task</label><input id={`${id}-title`} className={`${field} w-full`} placeholder="What do you want to do someday?" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className={compact ? 'w-full min-w-0' : 'flex-1 min-w-40'}><label htmlFor={`${id}-category`} className="block text-sm font-medium mb-1">Category (optional)</label><input id={`${id}-category`} className={`${field} w-full`} list={`${id}-categories`} value={category} onChange={(e) => setCategory(e.target.value)} /></div>
      <button className={buttonClass.primary} disabled={!title.trim()}>Add task</button>
    </form>
    <datalist id={`${id}-categories`}>{suggestions.map((value) => <option key={value} value={value} />)}</datalist>
    {!items.length && <p className="text-stone-600 dark:text-stone-400">Keep undated tasks here until you are ready to pick a day.</p>}
    {[...groups].map(([key, group]) => <section key={key} aria-label={group.label} className="space-y-3">
      <h2 className="text-lg font-semibold min-w-0 break-words">{group.label}</h2>
      <ul className="space-y-3">{group.items.map((item, index) => <BacklogRow key={item.id} item={item} today={today} compact={compact} listId={`${id}-categories`} first={index === 0} last={index === group.items.length - 1} {...actions} />)}</ul>
    </section>)}
  </div>;
};
