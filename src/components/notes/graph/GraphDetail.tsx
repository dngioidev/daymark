import React, { useId } from 'react';
import type { GraphNode, GraphEdge } from '../../../utils/graphData';
import { canLinkToTitle } from '../../../utils/noteRelated';

export interface GraphActions {
  onOpenNote(id: string): void;
  onLink(a: string, b: string): void;
  onDismiss(a: string, b: string): void;
  linkTarget?(a: string, b: string): GraphNode | undefined;
  tabIndex?: number;
}
export function ConnectionActions({ a, b, target, onLink, onDismiss, linkTarget, tabIndex }: { a: string; b: string; target: GraphNode } & Omit<GraphActions, 'onOpenNote'>) {
  const explanation = useId(), resolved = linkTarget ? linkTarget(a, b) : target;
  const safe = !!resolved && canLinkToTitle(resolved.title);
  return <div className="flex flex-wrap gap-2 items-center">
    <button type="button" tabIndex={tabIndex} aria-label={`Link to ${resolved?.title ?? target.title}`} className="min-h-11 px-2 border rounded disabled:opacity-60" disabled={!safe} aria-describedby={!safe ? explanation : undefined} onClick={() => { if (safe) onLink(a, b); }}>Link</button>
    <button type="button" tabIndex={tabIndex} aria-label={`Not related to ${target.title}`} className="min-h-11 px-2 border rounded" onClick={() => onDismiss(a, b)}>Not related</button>
    {!safe && <p id={explanation} className="text-xs">Rename this note to a title without wiki-link delimiters before linking.</p>}
  </div>;
}
export function GraphDetail({ nodes, edges, selectedId, ...actions }: { nodes: GraphNode[]; edges: GraphEdge[]; selectedId?: string } & GraphActions) {
  const selected = nodes.find(node => node.id === selectedId);
  if (!selected) return <p className="p-3">Select a note or a dashed suggestion.</p>;
  const byId = new Map(nodes.map(node => [node.id, node]));
  const connections = edges.filter(edge => edge.a === selected.id || edge.b === selected.id);
  return <div className="p-3 space-y-3 break-words">
    <h2 className="font-bold text-lg">{selected.title}</h2><p>{selected.folder || 'Root'} · {selected.degree} connections</p>
    <button type="button" className="min-h-11 px-3 border rounded" onClick={() => actions.onOpenNote(selected.id)}>Open note</button>
    <h3 className="font-semibold">Suggestions</h3>
    <ul className="space-y-3">{connections.filter(edge => edge.kind === 'suggested').map(edge => {
      const target = byId.get(edge.a === selected.id ? edge.b : edge.a)!;
      return <li key={target.id}><p>{target.title}</p><p className="text-xs">shares: {edge.terms?.join(', ')}</p><ConnectionActions {...actions} a={edge.a} b={edge.b} target={target} /></li>;
    })}</ul>
    <h3 className="font-semibold">Linked notes</h3>
    <ul>{connections.filter(edge => edge.kind === 'link').map(edge => {
      const target = byId.get(edge.a === selected.id ? edge.b : edge.a)!;
      return <li key={target.id}><button type="button" className="min-h-11 underline text-left" onClick={() => actions.onOpenNote(target.id)}>{target.title}</button></li>;
    })}</ul>
  </div>;
}
