import React from 'react';
import { FilePlus, Folder, FolderPlus, Search } from 'lucide-react';
import { normalizeFolderPath } from '../../utils/noteFolders';
import type { FolderNode } from '../../utils/noteFolders';

export function NotesStrip({ tree, currentFolder = '', onSearch, onNewNote, onNewFolder, onFolder, onExpand }: {
  tree: FolderNode[]; currentFolder?: string; onSearch(): void; onNewNote(): void; onNewFolder(): void;
  onFolder(path: string): void; onExpand(): void;
}) {
  const button = 'w-11 h-11 shrink-0 flex items-center justify-center rounded hover:bg-stone-100 dark:hover:bg-stone-800';
  return <div role="group" aria-label="Notes shortcuts" className="flex min-h-0 flex-col items-center overflow-y-auto text-stone-700 dark:text-stone-200">
    <button type="button" className={button} aria-label="Search notes" title="Search notes" onClick={onSearch}><Search size={18} /></button>
    <button type="button" className={button} aria-label="New note" title="New note" onClick={onNewNote}><FilePlus size={18} /></button>
    <button type="button" className={button} aria-label="New folder" title="New folder" onClick={onNewFolder}><FolderPlus size={18} /></button>
    {tree.slice(0, 8).map(folder => <button key={folder.path} type="button" className={`${button} ${normalizeFolderPath(currentFolder).toLowerCase().split('/')[0] === folder.path.toLowerCase() ? 'bg-stone-200 dark:bg-stone-700' : ''}`} aria-current={normalizeFolderPath(currentFolder).toLowerCase().split('/')[0] === folder.path.toLowerCase() ? 'true' : undefined} data-folder-path={folder.path}
      aria-label={`Open folder ${folder.path}`} title={folder.path} onClick={() => onFolder(folder.path)}><Folder size={18} /></button>)}
    {tree.length > 8 && <button type="button" className={button} aria-label={`${tree.length - 8} more folders`} title={`${tree.length - 8} more folders`} onClick={onExpand}>+{tree.length - 8}</button>}
  </div>;
}
