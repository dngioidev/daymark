import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GraphNode, GraphEdge } from '../../../utils/graphData';
import { ConnectionActions, type GraphActions } from './GraphDetail';

/** Rows rendered at once. A 1,000-note vault would otherwise mount and
 * reconcile thousands of list elements for every filter change. */
export const GRAPH_LIST_PAGE = 100;

/** Native buttons provide the same actions through Tab/Shift+Tab and Enter.
 * Adjacency is prepared once, not rescanned for each node in a large vault.
 * Large graphs show a window of rows; every visible node stays reachable by
 * keyboard through the Previous/Next page buttons or by narrowing with search
 * (`matches`, when given, limits the rows to the search results). */
export const GraphList = React.memo(function GraphList({ nodes, edges, matches, tabIndex = 0, ...actions }: { nodes: GraphNode[]; edges: GraphEdge[]; matches?: Set<string> } & GraphActions) {
  const { byId, adjacent } = useMemo(() => {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const adjacent = new Map<string, GraphEdge[]>();
    for (const edge of edges) for (const id of [edge.a, edge.b]) {
      if (!adjacent.has(id)) adjacent.set(id, []);
      adjacent.get(id)!.push(edge);
    }
    return { byId, adjacent };
  }, [nodes, edges]);
  const rows = useMemo(() => matches ? nodes.filter(node => matches.has(node.id)) : nodes, [nodes, matches]);
  const [page, setPage] = useState(0);
  const section = useRef<HTMLElement>(null), refocus = useRef(false);
  const pages = Math.max(1, Math.ceil(rows.length / GRAPH_LIST_PAGE));
  const current = Math.min(page, pages - 1), first = current * GRAPH_LIST_PAGE;
  const windowed = rows.slice(first, first + GRAPH_LIST_PAGE);
  const noun = matches ? 'matching notes' : 'notes';
  // Paging disables the button that was just pressed (Next on the last page), so
  // keyboard focus would be lost. Move it to the first row of the new page.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    section.current?.querySelector<HTMLButtonElement>('[data-node-id] button')?.focus();
  }, [current]);
  const go = (next: number) => { refocus.current = true; setPage(next); };
  const paged = rows.length > GRAPH_LIST_PAGE;
  return <section ref={section} aria-label="Graph nodes"><h2 className="font-bold">Visible notes and connections</h2>
    {nodes.length === 0 ? <p>No notes match these filters.</p> : matches && rows.length === 0 ? <p>No notes match this search.</p> : null}
    {/* Always mounted so screen readers register the live region before it changes. */}
    <p role="status" className={paged ? 'text-sm' : 'sr-only'}>{paged ? `Showing ${first + 1}–${first + windowed.length} of ${rows.length} ${noun}; use search or filters to narrow.` : ''}</p>
    {paged && <div className="flex flex-wrap items-center gap-2 py-2">
      <button type="button" tabIndex={tabIndex} className="min-h-11 px-2 border rounded disabled:opacity-60" disabled={current === 0} onClick={() => go(current - 1)}>Previous {GRAPH_LIST_PAGE} notes</button>
      <button type="button" tabIndex={tabIndex} className="min-h-11 px-2 border rounded disabled:opacity-60" disabled={current >= pages - 1} onClick={() => go(current + 1)}>Next {GRAPH_LIST_PAGE} notes</button>
    </div>}
    <ul className="space-y-4">{windowed.map(node => <li key={node.id} data-node-id={node.id} className="border-b border-stone-300 dark:border-stone-700 pb-3">
      <h3 className="font-semibold">{node.title}</h3><p>{node.folder || 'Root'}</p>
      <button type="button" tabIndex={tabIndex} className="min-h-11 underline" onClick={() => actions.onOpenNote(node.id)}>Open note: {node.title}</button>
      <ul>{(adjacent.get(node.id) ?? []).map(edge => {
        const target = byId.get(edge.a === node.id ? edge.b : edge.a)!;
        return <li key={`${target.id}-${edge.kind}`} data-target-id={target.id} data-edge-kind={edge.kind} className="pl-3"><span>{edge.kind}: {target.title}</span>{edge.kind === 'suggested' && <ConnectionActions {...actions} tabIndex={tabIndex} a={edge.a} b={edge.b} target={target} />}</li>;
      })}</ul>
    </li>)}</ul>
  </section>;
});
