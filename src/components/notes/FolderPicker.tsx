import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { FolderNode } from '../../utils/noteFolders';
import { Menu } from '../ui/Menu';
export function flattenFolders(tree: FolderNode[]): FolderNode[] {
  return tree.flatMap(node => [node, ...flattenFolders(node.children)]);
}
export function FolderPicker({ tree, value, onChange }: { tree: FolderNode[]; value: string; onChange(path: string): void }) {
  return <Menu sheetTitle="Move to folder" items={['', ...flattenFolders(tree).map(node => node.path)].map(path => ({ label: path ? path.split('/').join(' / ') : 'Notes (top level)', active: path === value, onSelect: () => onChange(path) }))} trigger={props => <button type="button" {...props} aria-label={`Move to folder: ${value || 'Notes'}`} className="min-h-11 min-w-0 max-w-full flex items-center gap-1 px-2 rounded-lg text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"><span className="truncate">{value ? value.split('/').join(' / ') : 'Notes'}</span><ChevronDown size={14} className="shrink-0" /></button>} />;
}
