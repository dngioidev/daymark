import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, MoreHorizontal, Pin, Plus, Search, X } from 'lucide-react';
import type { NoteMeta, StandaloneNote } from '../../types/daymark';
import { buildNoteTreeRows, noteTooltip, visibleRowKey, type NoteTreeRow } from '../../utils/noteTree';
import { normalizeFolderPath } from '../../utils/noteFolders';
import { Menu, type MenuItem } from '../ui/Menu';
import type { FolderAction } from './NoteFolderTree';
import { useTreeWindow } from './useTreeWindow';

export interface NoteNavigationProps {
  notes: StandaloneNote[]; meta: NoteMeta; openNoteId?: string; currentFolder: string;
  expanded: ReadonlySet<string>; onExpandedChange(next: Set<string>): void;
  query: string; onQueryChange(q: string): void; onOpenNote(id: string): void;
  onSelectFolder(path: string): void; onNewNote(): void; templateItems?: MenuItem[];
  onNewFolder(): void; onFolderAction(action: FolderAction, path: string): void;
  onDropNote?(noteId: string, folderPath: string): void; onDropFolder?(path: string, newParentPath: string): void;
  dragEnabled: boolean; compact?: boolean; viewSwitch?: React.ReactNode; focusSearch?: React.RefObject<boolean>;
}
const folderKey = (path: string) => normalizeFolderPath(path).toLowerCase();
const isItem = (row: NoteTreeRow) => row.kind === 'folder' || row.kind === 'note';
function highlighted(text: string, ranges?: [number, number][]) {
  if (!ranges?.length) return text;
  const parts: React.ReactNode[] = []; let end = 0;
  ranges.forEach(([from, to]) => { parts.push(text.slice(end, from), <mark key={from}>{text.slice(from, to)}</mark>); end = to; });
  parts.push(text.slice(end)); return parts;
}

export function NoteNavigation(props: NoteNavigationProps) {
  const { notes, meta, expanded, query, openNoteId, compact } = props;
  const { rows: modelRows, matchCount } = useMemo(() => buildNoteTreeRows({ notes, meta, expanded, query, openNoteId }), [notes, meta, expanded, query, openNoteId]);
  const rows = useMemo(() => modelRows.filter(row => row.kind !== 'status'), [modelRows]);
  const byId = useMemo(() => new Map(notes.map(note => [note.id, note])), [notes]);
  const [focusKey, setFocusKey] = useState('');
  const [dragging, setDragging] = useState(false);
  const [touch, setTouch] = useState(false);
  const dragEnabled = props.dragEnabled && !compact && !touch;
  const container = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (props.focusSearch?.current) { searchInput.current?.focus(); props.focusSearch.current = false; }
  }, [props.focusSearch]);
  const elements = useRef(new Map<string, HTMLDivElement>());
  const requestFocus = useRef(false);
  const itemIndices = rows.flatMap((row, i) => isItem(row) ? [i] : []);
  const focusedIndex = rows.findIndex(row => isItem(row) && visibleRowKey(row) === focusKey);
  const rowHeight = compact ? 44 : 32;
  const windowing = useTreeWindow(rows.length, rowHeight, container, focusedIndex >= 0 ? focusedIndex : itemIndices[0] ?? -1);
  const openIndex = windowing.indices.find(index => { const row = rows[index]; return row.kind === 'note' && row.noteId === openNoteId && row.group === 'tree'; })
    ?? windowing.indices.find(index => { const row = rows[index]; return row.kind === 'note' && row.noteId === openNoteId; });
  const effectiveFocus = focusedIndex >= 0 ? focusedIndex : openIndex ?? itemIndices[0] ?? -1;
  const keys = rows.map(visibleRowKey).join('\n');
  useLayoutEffect(() => {
    if (requestFocus.current && effectiveFocus >= 0) {
      elements.current.get(visibleRowKey(rows[effectiveFocus]))?.focus({ preventScroll: true });
      requestFocus.current = false;
    }
  }, [focusKey, keys]);
  const lastOpened = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!openNoteId || lastOpened.current === openNoteId) return;
    const index = rows.findIndex(row => row.kind === 'note' && row.noteId === openNoteId && row.group === 'tree');
    if (index < 0) return;
    windowing.scrollToIndex(index); lastOpened.current = openNoteId;
  }, [openNoteId, keys]);
  const focus = (index: number) => {
    if (index < 0) return;
    const key = visibleRowKey(rows[index]);
    windowing.scrollToIndex(index);
    const element = elements.current.get(key);
    element?.focus({ preventScroll: true });
    // Only defer focus when windowing has not mounted the target yet. A same-row
    // move must not leave a request behind that a later search render can consume.
    requestFocus.current = !element || document.activeElement !== element;
    setFocusKey(key);
  };
  const toggle = (row: Extract<NoteTreeRow, { kind: 'folder' }>) => {
    if (query.trim()) return; // Search forces paths open without changing the saved expansion.
    const next = new Set(expanded); const key = folderKey(row.path);
    if (row.expanded) next.delete(key); else next.add(key);
    props.onExpandedChange(next);
  };
  const activate = (row: NoteTreeRow) => {
    if (row.kind === 'note') props.onOpenNote(row.noteId);
    else if (row.kind === 'folder') { props.onSelectFolder(row.path); toggle(row); }
  };
  const keyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.target !== event.currentTarget) return;
    const row = rows[index]; const position = itemIndices.indexOf(index);
    const parent = () => {
      if (row.kind !== 'folder' && row.kind !== 'note') return -1;
      for (let i = index - 1; i >= 0; i--) {
        const candidate = rows[i];
        if (candidate.kind === 'folder' && candidate.depth < row.depth) return i;
      }
      return -1;
    };
    switch (event.key) {
      case 'Home': focus(itemIndices[0]); break;
      case 'End': focus(itemIndices.at(-1)!); break;
      case 'ArrowDown': focus(itemIndices[Math.min(itemIndices.length - 1, position + 1)]); break;
      case 'ArrowUp': focus(itemIndices[Math.max(0, position - 1)]); break;
      case 'ArrowRight':
        if (row.kind === 'folder') {
          if (!row.expanded) toggle(row);
          else { const next = rows[index + 1]; if (next && 'depth' in next && next.depth > row.depth) focus(index + 1); }
        } break;
      case 'ArrowLeft': if (row.kind === 'folder' && row.expanded && !query.trim()) toggle(row); else focus(parent()); break;
      case 'Enter': case ' ': activate(row); break;
      case 'F10':
        if (!event.shiftKey) return;
        // Shift+F10 and the Menu key both expose actions without entering children.
      case 'ContextMenu':
        if (row.kind !== 'folder') return;
        (event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>('button')?.click(); break;
      default: return;
    }
    event.preventDefault();
  };
  const drop = (event: React.DragEvent, path: string) => {
    event.preventDefault(); event.stopPropagation(); setDragging(false);
    const note = event.dataTransfer.getData('application/daymark-note');
    const folder = event.dataTransfer.getData('application/daymark-folder');
    if (note) props.onDropNote?.(note, path); else if (folder) props.onDropFolder?.(folder, path);
  };
  // Flat tree DOM still exposes sibling position and size, including unmounted siblings.
  const siblingGroups = new Map<string, number[]>();
  rows.forEach((row, index) => {
    if (!isItem(row)) return;
    const parent = row.kind === 'folder' ? folderKey(row.path).split('/').slice(0, -1).join('/') : row.kind === 'note' ? folderKey(byId.get(row.noteId)?.folder ?? '') : '';
    const group = row.kind === 'note' && row.group === 'pinned' ? 'pinned' : `tree:${parent}`;
    const siblings = siblingGroups.get(group) ?? []; siblings.push(index); siblingGroups.set(group, siblings);
  });
  const positions = new Map<number, { size: number; position: number }>();
  for (const siblings of siblingGroups.values()) siblings.forEach((index, position) => positions.set(index, { size: siblings.length, position: position + 1 }));
  const renderRow = (index: number) => {
    const row = rows[index]; const key = visibleRowKey(row);
    const style: React.CSSProperties = { height: rowHeight, ...(windowing.virtual ? { position: 'absolute', top: index * rowHeight, left: 0, right: 0 } : {}), ...('depth' in row ? { paddingLeft: 8 + row.depth * 16 } : {}) };
    if (row.kind === 'pinned-heading') return null;
    const folder = row.kind === 'folder'; const note = row.kind === 'note' ? byId.get(row.noteId) : undefined;
    const selected = row.kind === 'note' && row.noteId === openNoteId;
    const current = folder && folderKey(row.path) === folderKey(props.currentFolder);
    const name = folder ? `${row.name}, folder, ${row.totalNotes} ${row.totalNotes === 1 ? 'note' : 'notes'}` : `${row.title}${row.pinned ? ', pinned' : ''}`;
    return <div key={key} ref={el => { if (el) elements.current.set(key, el); else elements.current.delete(key); }} role="treeitem" aria-label={name}
      aria-keyshortcuts={folder ? 'Shift+F10 ContextMenu' : undefined} aria-description={folder ? 'Shift+F10 or Menu key opens actions' : undefined}
      aria-level={row.depth + 1} aria-expanded={folder ? row.expanded : undefined} aria-selected={folder ? undefined : selected}
      aria-current={current ? 'true' : undefined} aria-setsize={positions.get(index)?.size} aria-posinset={positions.get(index)?.position}
      data-note-id={row.kind === 'note' ? row.noteId : undefined} data-folder-path={folder ? row.path : undefined}
      tabIndex={index === effectiveFocus ? 0 : -1} title={note ? noteTooltip(note) : folder ? row.path : undefined} style={style}
      className={`flex min-w-0 items-center gap-1 rounded px-2 cursor-pointer text-sm text-stone-800 dark:text-stone-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-stone-500 ${selected ? 'bg-stone-200 dark:bg-stone-700' : current ? 'bg-stone-100 dark:bg-stone-800' : 'hover:bg-stone-100 dark:hover:bg-stone-800'} ${row.kind === 'note' && row.dimmed ? 'opacity-70' : ''}`}
      onFocus={event => { if (event.target === event.currentTarget) setFocusKey(key); }} onKeyDown={event => keyDown(event, index)}
      onClick={() => { setFocusKey(key); activate(row); }}
      onPointerDown={event => setTouch(event.pointerType === 'touch' || event.pointerType === 'pen')}
      draggable={dragEnabled || undefined} onDragStart={dragEnabled ? event => {
        event.dataTransfer.setData(folder ? 'application/daymark-folder' : 'application/daymark-note', folder ? row.path : row.noteId);
        event.dataTransfer.effectAllowed = 'move'; setDragging(true);
      } : undefined} onDragEnd={dragEnabled ? () => setDragging(false) : undefined}
      onDragOver={dragEnabled && folder ? event => event.preventDefault() : undefined} onDrop={dragEnabled && folder ? event => drop(event, row.path) : undefined}>
      {folder ? <>{row.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<Folder size={14} className="shrink-0" /><span className="truncate flex-1">{row.name}</span><span aria-hidden="true" data-count={row.totalNotes} className="text-xs text-stone-500 after:content-[attr(data-count)]" />
        <span onClick={event => event.stopPropagation()}><Menu sheetTitle={row.path} items={(['new', 'rename', 'move', 'delete'] as const).map(action => ({ label: action === 'new' ? 'New folder inside' : `${action[0].toUpperCase()}${action.slice(1)} folder`, onSelect: () => props.onFolderAction(action, row.path) }))} trigger={trigger => <button type="button" {...trigger} tabIndex={-1} aria-label={`Actions for ${row.path}`} className={`${compact ? 'w-11 h-11' : 'w-7 h-8'} shrink-0 flex items-center justify-center`}><MoreHorizontal size={16} /></button>} /></span>
      </> : <><span className="min-w-0 flex-1 truncate">{highlighted(row.title, row.titleMatch)}{row.snippet && <span className="ml-2 text-xs text-stone-500">{row.snippet.before}<mark>{row.snippet.match}</mark>{row.snippet.after}</span>}</span>{row.pinned && <Pin size={12} aria-label="Pin" className="shrink-0" />}</>}
    </div>;
  };
  return <div data-notes-column className="flex flex-1 min-h-0 min-w-0 flex-col rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
    <div className="shrink-0 p-2 space-y-2">
      <div className="relative flex items-center gap-1"><Search size={14} className="absolute left-2 text-stone-500" /><label htmlFor="notes-search" className="sr-only">Search notes</label><input id="notes-search" ref={searchInput} type="search" placeholder="Search notes" value={query} onChange={event => props.onQueryChange(event.target.value)} className={`min-w-0 w-full ${compact ? 'min-h-11' : 'min-h-11 sm:min-h-9'} pl-7 pr-8 rounded-lg bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700`} />{query && <button type="button" aria-label="Clear search" className={`absolute right-0 ${compact ? 'w-11 min-h-11' : 'w-11 sm:w-8 min-h-11 sm:min-h-9'}`} onClick={() => props.onQueryChange('')}><X size={14} /></button>}</div>
      <div role="status" aria-live="polite" className="text-xs text-stone-600 dark:text-stone-400">{query.trim() ? `${matchCount} ${matchCount === 1 ? 'note matches' : 'notes match'}` : ''}</div>
      <div className="flex items-center gap-1 text-xs"><div className="inline-flex"><button type="button" onClick={props.onNewNote} className={`inline-flex items-center ${compact ? 'min-h-11' : 'min-h-11 sm:min-h-9'} px-1 rounded-l bg-stone-200 dark:bg-stone-700`}><Plus size={14} /> New note</button><Menu sheetTitle="Note templates" items={props.templateItems ?? []} trigger={trigger => <button type="button" {...trigger} aria-label="Note templates" className={`${compact ? 'min-h-11' : 'min-h-11 sm:min-h-9'} px-1 rounded-r bg-stone-200 dark:bg-stone-700`}><ChevronDown size={14} /></button>} /></div><button type="button" aria-label="New folder" className={`${compact ? 'min-h-11' : 'min-h-11 sm:min-h-9'} px-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800`} onClick={props.onNewFolder}>New folder</button>{props.viewSwitch}</div>
    </div>
    {modelRows.filter(row => row.kind === 'status').map(row => <p key={visibleRowKey(row)} className="px-2 text-xs text-stone-600 dark:text-stone-400">{row.text}</p>)}
    <div ref={container} onScroll={windowing.onScroll} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { requestFocus.current = false; setFocusKey(''); }
    }} className="flex-1 min-h-0 overflow-y-auto" role="tree" aria-label="Notes">
      <div role="none" className="relative" style={windowing.virtual ? { height: windowing.totalHeight } : undefined}>{rows.some(row => row.kind === 'pinned-heading') && <div role="group" aria-label="Pinned" className={`before:content-[attr(aria-label)] before:flex before:items-center before:px-2 before:text-xs before:font-semibold before:text-stone-500 ${compact ? 'before:h-11' : 'before:h-8'}`}>{windowing.indices.filter(index => { const row = rows[index]; return row.kind === 'note' && row.group === 'pinned'; }).map(renderRow)}</div>}{windowing.indices.filter(index => { const row = rows[index]; return row.kind !== 'pinned-heading' && !(row.kind === 'note' && row.group === 'pinned'); }).map(renderRow)}</div>
    </div>
    {dragEnabled && dragging && <div role="group" aria-label="Move to top level" onDragOver={event => event.preventDefault()} onDrop={event => drop(event, '')} className="shrink-0 py-1 text-center text-xs border-t border-stone-300 dark:border-stone-700">Move to top level</div>}
  </div>;
}
