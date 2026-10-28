import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, MoreHorizontal } from 'lucide-react';
import type { FolderNode } from '../../utils/noteFolders';
import { Menu } from '../ui/Menu';

export type FolderAction = 'new' | 'rename' | 'move' | 'delete';
interface Props {
  tree: FolderNode[];
  selectedPath: string | 'all';
  onSelect(path: string | 'all'): void;
  onFolderAction(action: FolderAction, path: string): void;
  onDropNote?(noteId: string, path: string): void;
  onDropFolder?(path: string, newParentPath: string): void;
  compact?: boolean;
  minimized?: boolean;
}
export function NoteFolderTree({ tree, selectedPath, onSelect, onFolderAction, onDropNote, onDropFolder, compact, minimized }: Props) {
  const [closed, setClosed] = useState<string[]>([]);
  const row = 'min-h-11 min-w-0 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800';
  const drop = (event: React.DragEvent, path: string) => {
    event.preventDefault(); event.stopPropagation();
    const noteId = event.dataTransfer.getData('application/daymark-note');
    const folder = event.dataTransfer.getData('application/daymark-folder');
    if (noteId) onDropNote?.(noteId, path);
    else if (folder) onDropFolder?.(folder, path);
  };
  const renderNodes = (nodes: FolderNode[]): React.ReactNode => nodes.map(node => {
    const expanded = !closed.includes(node.path);
    return <li key={node.path}>
      <div className="flex min-w-0 items-center" onDragOver={compact ? undefined : e => e.preventDefault()} onDrop={compact ? undefined : e => drop(e, node.path)}>
        {!minimized && node.children.length > 0 && <button type="button" className={`${row} w-11 shrink-0 flex items-center justify-center`} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.path}`} aria-expanded={expanded} onClick={() => setClosed(expanded ? [...closed, node.path] : closed.filter(path => path !== node.path))}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>}
        <button type="button" draggable={!compact} onDragStart={e => { e.dataTransfer.setData('application/daymark-folder', node.path); e.dataTransfer.effectAllowed = 'move'; }} title={node.path} aria-label={`${node.path}, ${node.totalCount} ${node.totalCount === 1 ? 'note' : 'notes'}`} aria-current={selectedPath === node.path ? 'true' : undefined} onClick={() => onSelect(node.path)} className={`${row} flex flex-1 items-center gap-2 px-2 text-left ${selectedPath === node.path ? 'bg-stone-200 dark:bg-stone-700' : ''}`}>
          <Folder size={16} className="shrink-0" /><span className={minimized ? 'sr-only' : 'truncate flex-1'}>{node.name}</span><span className={minimized ? 'sr-only' : 'text-xs'}>{node.totalCount}</span>
        </button>
        {!minimized && <Menu sheetTitle={node.path} items={(['new', 'rename', 'move', 'delete'] as const).map(action => ({ label: action === 'new' ? 'New folder inside' : `${action[0].toUpperCase()}${action.slice(1)} folder`, onSelect: () => onFolderAction(action, node.path) }))} trigger={props => <button type="button" {...props} className={`${row} w-11 shrink-0 flex items-center justify-center`} aria-label={`Actions for ${node.path}`}><MoreHorizontal size={18} /></button>} />}
      </div>
      {node.children.length > 0 && (expanded || minimized) && <ul aria-label={`${node.path} subfolders`} className={minimized ? '' : 'pl-3'}>{renderNodes(node.children)}</ul>}
    </li>;
  });
  return <ul aria-label="Folders" className="min-w-0 text-sm text-stone-800 dark:text-stone-200">
    <li><button type="button" title="All notes" aria-label="All notes" aria-current={selectedPath === 'all' ? 'true' : undefined} onClick={() => onSelect('all')} className={`${row} w-full px-2 text-left`}>{minimized ? <Folder size={16} /> : 'All notes'}</button></li>
    <li onDragOver={compact ? undefined : e => e.preventDefault()} onDrop={compact ? undefined : e => drop(e, '')}><button type="button" aria-label="Notes (top level)" title="Notes (top level)" aria-current={selectedPath === '' ? 'true' : undefined} onClick={() => onSelect('')} className={`${row} w-full px-2 text-left`}>{minimized ? <Folder size={16} /> : 'Notes'}</button></li>
    {renderNodes(tree)}
  </ul>;
}
