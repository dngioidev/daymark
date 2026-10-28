// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { GRAPH_LIST_PAGE, GraphList } from './GraphList';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('exposes each visible node and its actionable connections in a semantic keyboard list', () => {
  const html = renderToStaticMarkup(React.createElement(GraphList, { nodes: ['a', 'b'].map(id => ({ id, title: id, folder: '', tags: [], degree: 1 })), edges: [{ a: 'a', b: 'b', kind: 'suggested' }], onOpenNote: () => {}, onLink: () => {}, onDismiss: () => {} }));
  for (const text of ['<ul', '<li', '<button', 'Open note', '>Link<', 'Not related', 'suggested']) expect(html).toContain(text);
});
it('windows a large vault into pages with a polite status; every node is reachable by paging or by search', async () => {
  const nodes = Array.from({ length: 250 }, (_, i) => ({ id: String(i), title: `Note ${i}`, folder: '', tags: [], degree: 1 }));
  const edges = [{ a: '0', b: '249', kind: 'suggested' as const }];
  const host = document.createElement('div'), root = createRoot(host), opened: string[] = [];
  const props = { nodes, edges, onOpenNote: (id: string) => opened.push(id), onLink: () => {}, onDismiss: () => {} };
  const rows = () => [...host.querySelectorAll('[data-node-id]')].map(row => row.getAttribute('data-node-id'));
  document.body.append(host);
  const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent === text)!;
  try {
    await act(async () => root.render(React.createElement(GraphList, props)));
    expect(rows()).toHaveLength(GRAPH_LIST_PAGE); expect(rows()[0]).toBe('0');
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Showing 1–100 of 250 notes; use search or filters to narrow.');
    expect(button('Previous 100 notes').disabled).toBe(true);
    const seen = new Set(rows());
    for (const end of [200, 250]) { await act(async () => button('Next 100 notes').click()); rows().forEach(id => seen.add(id)); expect(rows().at(-1)).toBe(String(end - 1)); }
    expect(seen.size).toBe(250); expect(button('Next 100 notes').disabled).toBe(true);
    // The pressed Next button is now disabled; focus moves to the first row of the new page.
    expect(document.activeElement).toBe(host.querySelector('[data-node-id="200"] button'));
    expect(host.querySelector('[role="status"]')?.textContent).toContain('201–250 of 250');
    // The far end of a suggestion keeps its actions on its own page.
    expect(host.querySelector('[data-node-id="249"] button[aria-label="Not related to Note 0"]')).not.toBeNull();
    // Search narrows the rows (and returns to a valid page) without paging.
    await act(async () => root.render(React.createElement(GraphList, { ...props, matches: new Set(['7', '149']) })));
    expect(rows()).toEqual(['7', '149']); expect(host.querySelector('[role="status"]')?.textContent).toBe('');
    await act(async () => (host.querySelector('[data-node-id="149"] button') as HTMLButtonElement).click()); expect(opened).toEqual(['149']);
    await act(async () => root.render(React.createElement(GraphList, { ...props, matches: new Set<string>() })));
    expect(host.textContent).toContain('No notes match this search.');
  } finally { await act(async () => root.unmount()); host.remove(); }
});
it('mounts the polite status region even when the list is short so later announcements are not missed', async () => {
  const host = document.createElement('div'), root = createRoot(host);
  const nodes = Array.from({ length: 3 }, (_, i) => ({ id: String(i), title: `N${i}`, folder: '', tags: [], degree: 0 }));
  try {
    await act(async () => root.render(React.createElement(GraphList, { nodes, edges: [], onOpenNote: () => {}, onLink: () => {}, onDismiss: () => {} })));
    const status = host.querySelector('[role="status"]');
    expect(status).not.toBeNull(); expect(status!.textContent).toBe('');
    const many = Array.from({ length: 150 }, (_, i) => ({ id: String(i), title: `N${i}`, folder: '', tags: [], degree: 0 }));
    await act(async () => root.render(React.createElement(GraphList, { nodes: many, edges: [], onOpenNote: () => {}, onLink: () => {}, onDismiss: () => {} })));
    expect(host.querySelector('[role="status"]')).toBe(status); expect(status!.textContent).toContain('Showing 1–100 of 150');
  } finally { await act(async () => root.unmount()); }
});
