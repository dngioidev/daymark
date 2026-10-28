import React, { useEffect, useRef } from 'react';
import type { FolderNode } from '../../../utils/noteFolders';
import { normalizeFolderPath } from '../../../utils/noteFolders';
import { OWN_FOLDER_PREFIX, ROOT_FOLDER, type GraphOptions } from '../../../utils/graphData';

const key = (path: string) => normalizeFolderPath(path).toLowerCase();
const under = (path: string, parent: string) => !parent || key(path) === key(parent) || key(path).startsWith(key(parent) + '/');
const selected = (path: string, paths: string[] | null) => paths === null || paths.some(parent => parent.startsWith(OWN_FOLDER_PREFIX)
  ? key(path) === key(parent.slice(OWN_FOLDER_PREFIX.length)) : parent !== ROOT_FOLDER && under(path, parent));
export function GraphFilters({ tree, tags, options, onChange, activeNoteId }: {
  tree: FolderNode[]; tags: string[]; options: GraphOptions; onChange(options: GraphOptions): void; activeNoteId?: string;
}) {
  const patch = (value: Partial<GraphOptions>) => onChange({ ...options, ...value });
  const allInput = useRef<HTMLInputElement>(null);
  const paths = options.folderPaths;
  const allChecked = paths === null || (paths.includes(ROOT_FOLDER) && flatten(tree).every(path => selected(path, paths)));
  const allMixed = !allChecked && !!paths?.length;
  useEffect(() => { if (allInput.current) allInput.current.indeterminate = allMixed; }, [allMixed]);
  return <div className="p-3 space-y-3">
    <label className="block">Search graph<input type="search" value={options.query ?? ''} onChange={e => patch({ query: e.target.value })} className="block w-full min-h-11 px-2 border rounded bg-transparent" /></label>
    <fieldset><legend className="font-semibold">Folders</legend>
      <label className="flex items-center min-h-9 gap-2"><input ref={allInput} type="checkbox" aria-checked={allMixed ? 'mixed' : allChecked} checked={allChecked} onChange={e => patch({ folderPaths: e.target.checked ? null : [] })} />All folders</label>
      <label className="flex items-center min-h-9 gap-2"><input type="checkbox" aria-label="Root (no folder)" checked={options.folderPaths === null || options.folderPaths.includes(ROOT_FOLDER)} onChange={e => {
        const paths = options.folderPaths ?? [...flatten(tree), ROOT_FOLDER];
        patch({ folderPaths: e.target.checked ? [...paths, ROOT_FOLDER] : paths.filter(path => path !== ROOT_FOLDER) });
      }} />Root (no folder)</label>
      <ul>{tree.map(node => <Folder key={node.path} node={node} tree={tree} options={options} patch={patch} />)}</ul>
    </fieldset>
    <label className="block">Tag<select className="block w-full min-h-11 bg-white dark:bg-stone-900 border rounded" value={options.tag ?? ''} onChange={e => patch({ tag: e.target.value || undefined })}><option value="">All tags</option>{tags.map(tag => <option key={tag}>{tag}</option>)}</select></label>
    <fieldset><legend className="font-semibold">Connections</legend>{([['showSuggestions', 'Suggestions'], ['showTags', 'Tag lines'], ['showOrphans', 'Orphans']] as const).map(([field, label]) => <label key={field} className="flex items-center min-h-9 gap-2"><input type="checkbox" checked={options[field]} onChange={e => patch({ [field]: e.target.checked })} />{label}</label>)}</fieldset>
    <fieldset><legend className="font-semibold">Scope</legend>
      <label className="flex items-center min-h-9 gap-2"><input name="graph-scope" type="radio" checked={!options.local} onChange={() => patch({ local: undefined })} />Whole vault</label>
      <label className="flex items-center min-h-9 gap-2"><input name="graph-scope" type="radio" checked={!!options.local} disabled={!activeNoteId} onChange={() => activeNoteId && patch({ local: { noteId: activeNoteId, depth: 2 } })} />Local (2 steps)</label>
    </fieldset>
  </div>;
}
function Folder({ node, tree, options, patch }: { node: FolderNode; tree: FolderNode[]; options: GraphOptions; patch(value: Partial<GraphOptions>): void }) {
    const input = useRef<HTMLInputElement>(null);
    const subtree = flatten([node]);
    const checked = subtree.every(path => selected(path, options.folderPaths));
    const mixed = !checked && subtree.some(path => selected(path, options.folderPaths));
    useEffect(() => { if (input.current) input.current.indeterminate = mixed; }, [mixed]);
    return <li>
      <label className="flex items-center gap-2 min-h-9"><input ref={input} type="checkbox" data-folder-path={node.path} aria-label={`${node.name}, ${node.totalCount} ${node.totalCount === 1 ? 'note' : 'notes'}${node.path.includes('/') ? `, in ${node.path.split('/').slice(0, -1).join('/')}` : ''}`} aria-checked={mixed ? 'mixed' : checked} checked={checked} onChange={() => {
        const paths = options.folderPaths;
        const all = flatten(tree);
        // Expand to exact own-note selections before toggling a subtree.
        const own = new Set(all.filter(path => under(path, node.path) ? !checked : selected(path, paths)));
        const compact: string[] = paths === null || paths.includes(ROOT_FOLDER) ? [ROOT_FOLDER] : [];
        for (const path of all) {
          if (!own.has(path) || compact.some(parent => !parent.startsWith('\0') && under(path, parent))) continue;
          compact.push(all.filter(child => under(child, path)).every(child => own.has(child)) ? path : OWN_FOLDER_PREFIX + path);
        }
        patch({ folderPaths: compact });
      }} /><span>{node.name}, {node.totalCount} {node.totalCount === 1 ? 'note' : 'notes'}</span></label>
      {node.children.length > 0 && <ul className="pl-4">{node.children.map(child => <Folder key={child.path} node={child} tree={tree} options={options} patch={patch} />)}</ul>}
    </li>;
}
function flatten(tree: FolderNode[]): string[] { return tree.flatMap(node => [node.path, ...flatten(node.children)]); }
