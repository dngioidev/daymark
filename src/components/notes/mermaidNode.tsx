import React, { useState } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { MermaidDiagram } from './mermaidDiagram';

function MermaidView({ node, updateAttributes, editor }: NodeViewProps) {
  const [editing, setEditing] = useState(!!node.attrs.editing);
  return <NodeViewWrapper className="rounded-lg border border-stone-400 bg-stone-50 p-3 text-stone-900 dark:bg-stone-900 dark:text-stone-100" contentEditable={false}>
    {editing ? <div>
      <textarea aria-label="Mermaid source" autoFocus value={node.attrs.source} onChange={event => updateAttributes({ source: event.target.value })} onKeyDown={event => { if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) { event.preventDefault(); setEditing(false); } }} className="min-h-44 w-full rounded border border-stone-400 bg-white p-2 font-mono text-sm text-stone-900 dark:bg-stone-800 dark:text-stone-100" />
      <button type="button" className="min-h-11 min-w-11 px-3" onClick={() => setEditing(false)}>Show diagram</button>
    </div> : <div role={editor.isEditable ? 'button' : undefined} tabIndex={editor.isEditable ? 0 : undefined} aria-label="Edit Mermaid diagram" className="min-h-11" onClick={() => { if (editor.isEditable) setEditing(true); }} onKeyDown={event => { if (editor.isEditable && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setEditing(true); } }}><MermaidDiagram source={node.attrs.source} /></div>}
  </NodeViewWrapper>;
}
export const Mermaid = Node.create({
  name: 'mermaid', group: 'block', atom: true,
  addAttributes: () => ({ source: { default: '' }, editing: { default: false, rendered: false } }),
  parseHTML: () => [{ tag: 'pre[data-mermaid]', priority: 100, getAttrs: element => ({ source: element.textContent ?? '' }) }],
  renderHTML: ({ node }) => ['pre', { 'data-mermaid': '' }, ['code', { class: 'language-mermaid' }, node.attrs.source]],
  addNodeView: () => ReactNodeViewRenderer(MermaidView),
  markdownTokenName: 'code',
  parseMarkdown: token => token.lang === 'mermaid' ? { type: 'mermaid', attrs: { source: token.text ?? '' } } : [],
  renderMarkdown: node => {
    const source = String(node.attrs?.source ?? '');
    const fence = '`'.repeat(Math.max(3, ...Array.from(source.matchAll(/`+/g), match => match[0].length + 1)));
    return `${fence}mermaid\n${source}\n${fence}`;
  },
});
