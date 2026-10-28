import React, { useMemo } from 'react';
import type { GraphNode, GraphEdge } from '../../../utils/graphData';
import { ConnectionActions, type GraphActions } from './GraphDetail';

/** Native buttons provide the same actions through Tab/Shift+Tab and Enter.
 * Adjacency is prepared once, not rescanned for each node in a large vault. */
export function GraphList({ nodes, edges, ...actions }: { nodes: GraphNode[]; edges: GraphEdge[] } & GraphActions) {
  const { byId, adjacent } = useMemo(() => {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const adjacent = new Map<string, GraphEdge[]>();
    for (const edge of edges) for (const id of [edge.a, edge.b]) {
      if (!adjacent.has(id)) adjacent.set(id, []);
      adjacent.get(id)!.push(edge);
    }
    return { byId, adjacent };
  }, [nodes, edges]);
  return <section aria-label="Graph nodes"><h2 className="font-bold">Visible notes and connections</h2>
    {nodes.length === 0 && <p>No notes match these filters.</p>}
    <ul className="space-y-4">{nodes.map(node => <li key={node.id} className="border-b border-stone-300 dark:border-stone-700 pb-3">
      <h3 className="font-semibold">{node.title}</h3><p>{node.folder || 'Root'}</p>
      <button type="button" className="min-h-11 underline" onClick={() => actions.onOpenNote(node.id)}>Open note: {node.title}</button>
      <ul>{(adjacent.get(node.id) ?? []).map(edge => {
        const target = byId.get(edge.a === node.id ? edge.b : edge.a)!;
        return <li key={`${target.id}-${edge.kind}`} className="pl-3"><span>{edge.kind}: {target.title}</span>{edge.kind === 'suggested' && <ConnectionActions {...actions} a={edge.a} b={edge.b} target={target} />}</li>;
      })}</ul>
    </li>)}</ul>
  </section>;
}
