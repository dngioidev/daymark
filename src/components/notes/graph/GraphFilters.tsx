import React, { useEffect, useRef } from 'react';
import type { FolderNode } from '../../../utils/noteFolders';
import { normalizeFolderPath } from '../../../utils/noteFolders';
import type { GraphOptions } from '../../../utils/graphData';

const key = (path: string) => normalizeFolderPath(path).toLowerCase();
const under = (path: string, parent: string) => !parent || key(path) === key(parent) || key(path).startsWith(key(parent) + '/');
export function GraphFilters({ tree, tags, options, onChange, activeNoteId }: {
  tree: FolderNode[]; tags: string[]; options: GraphOptions; onChange(options: GraphOptions): void; activeNoteId?: string;
}) {
  const patch = (value: Partial<GraphOptions>) => onChange({ ...options, ...value });
  return <div className="p-3 space-y-3">
    <label className="block">Search graph<input type="search" value={options.query ?? ''} onChange={e => patch({ query: e.target.value })} className="block w-full min-h-11 px-2 border rounded bg-transparent" /></label>
    <fieldset><legend className="font-semibold">Folders</legend>
      <label className="flex items-center min-h-9 gap-2"><input type="checkbox" checked={options.folderPaths === null} onChange={e => patch({ folderPaths: e.target.checked ? null : [] })} />All folders</label>
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
    const checked = options.folderPaths === null || options.folderPaths.some(path => under(node.path, path));
    const mixed = !checked && !!options.folderPaths?.some(path => under(path, node.path));
    useEffect(() => { if (input.current) input.current.indeterminate = mixed; }, [mixed]);
    return <li>
      <label className="flex items-center gap-2 min-h-9"><input ref={input} type="checkbox" aria-label={node.path} aria-checked={mixed ? 'mixed' : checked} checked={checked} onChange={() => {
        let paths = options.folderPaths;
        if (paths === null) paths = [...flatten(tree), ''];
        if (checked) {
          // Expand an ancestor selection before subtracting this branch.
          const expanded = flatten(tree).filter(path => paths!.some(parent => under(path, parent)) && !under(path, node.path) && !under(node.path, path));
          patch({ folderPaths: expanded });
        } else patch({ folderPaths: [...paths.filter(path => !under(path, node.path)), node.path] });
      }} />{node.name} <span className="text-xs">{node.totalCount}</span></label>
      {node.children.length > 0 && <ul className="pl-4">{node.children.map(child => <Folder key={child.path} node={child} tree={tree} options={options} patch={patch} />)}</ul>}
    </li>;
}
function flatten(tree: FolderNode[]): string[] { return tree.flatMap(node => [node.path, ...flatten(node.children)]); }
