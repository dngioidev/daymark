import React, { useState } from 'react';
import type { FolderNode } from '../../utils/noteFolders';
import { Dialog, buttonClass } from '../ui/Dialog';
import { flattenFolders } from './FolderPicker';
import type { FolderAction } from './NoteFolderTree';
export function deleteFolderMessage(path: string, count: number): string {
  return `${count} ${count === 1 ? 'note moves' : 'notes move'} to ${path.split('/').slice(0, -1).join('/') || 'Notes'}. No notes are deleted. Subfolders are removed too.`;
}
export function mergeFolderMessage(path: string, count: number): string {
  return `${count} ${count === 1 ? 'note is' : 'notes are'} affected by merging into ${path}. All notes will be kept.`;
}
export function FolderDialogs({ action, path, tree, onClose, onSubmit }: { action: FolderAction; path: string; tree: FolderNode[]; onClose(): void; onSubmit(value: string): Promise<void> | void }) {
  const [value, setValue] = useState(action === 'rename' ? path.split('/').at(-1)! : action === 'move' ? path.split('/').slice(0, -1).join('/') : '');
  const [busy, setBusy] = useState(false);
  const title = action === 'new' ? 'New folder' : action === 'rename' ? 'Rename folder' : 'Move folder';
  const contextPath = action === 'rename' ? path.split('/').slice(0, -1).join('/') : path;
  return <Dialog isOpen onClose={onClose} title={title} variant="sheet" description={contextPath ? `In ${contextPath}` : 'At the top level'}>
    <form className="p-4 space-y-4" onSubmit={async event => { event.preventDefault(); setBusy(true); try { await onSubmit(value); } finally { setBusy(false); } }}>
      {action === 'move' ? <label className="block">Destination folder<select aria-label="Destination folder" value={value} onChange={e => setValue(e.target.value)} className="block w-full min-h-11 border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 rounded-lg px-2"><option value="">Notes (top level)</option>{flattenFolders(tree).filter(node => node.path.toLowerCase() !== path.toLowerCase() && !node.path.toLowerCase().startsWith(`${path.toLowerCase()}/`)).map(node => <option key={node.path} value={node.path}>{node.path.split('/').join(' / ')}</option>)}</select></label> : <label className="block">Folder name<input aria-label="Folder name" autoFocus value={value} onChange={e => setValue(e.target.value)} pattern="[^\/]+" required className="block w-full min-h-11 border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 rounded-lg px-2" /></label>}
      <div className="flex justify-end gap-2"><button type="button" className={buttonClass.secondary} onClick={onClose}>Cancel</button><button type="submit" disabled={busy || (action !== 'move' && !value.trim())} className={buttonClass.primary}>{action === 'new' ? 'Create' : action === 'move' ? 'Move' : 'Rename'}</button></div>
    </form>
  </Dialog>;
}
