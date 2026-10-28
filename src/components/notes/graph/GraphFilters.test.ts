// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { GraphFilters } from './GraphFilters';
import type { GraphOptions } from '../../../utils/graphData';
import { ROOT_FOLDER } from '../../../utils/graphData';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const tree = [{ path: 'Tech', name: 'Tech', ownCount: 1, totalCount: 2, children: [{ path: 'Tech/Java', name: 'Java', ownCount: 1, totalCount: 1, children: [] }] }];
const options: GraphOptions = { folderPaths: ['Tech/Java'], showTags: true, showSuggestions: true, showOrphans: true };
it('renders real folders and filters; exposes a mixed parent and checking it includes descendants', async () => {
  const html = renderToStaticMarkup(React.createElement(GraphFilters, { tree, tags: ['java'], options, onChange: () => {}, activeNoteId: 'a' }));
  for (const label of ['Suggestions', 'Tag lines', 'Orphans', 'Local (2 steps)', 'Whole vault', 'Search graph', 'Java']) expect(html).toContain(label);
  const host = document.createElement('div'), root = createRoot(host); let result = options;
  await act(async () => root.render(React.createElement(GraphFilters, { tree, tags: [], options, onChange: o => { result = o; }, activeNoteId: 'a' })));
  const parent = host.querySelector<HTMLInputElement>('[data-folder-path="Tech"]')!;
  expect(parent.indeterminate).toBe(true); expect(parent.getAttribute('aria-checked')).toBe('mixed');
  await act(async () => parent.click()); expect(result.folderPaths).toEqual(['Tech']);
  await act(async () => root.unmount());
});
it('retains keyboard focus when a folder changes the filter', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  function Probe() { const [value, setValue] = React.useState(options); return React.createElement(GraphFilters, { tree, tags: [], options: value, onChange: setValue }); }
  await act(async () => root.render(React.createElement(Probe)));
  const parent = host.querySelector<HTMLInputElement>('[data-folder-path="Tech"]')!; parent.focus();
  await act(async () => parent.click()); expect(document.activeElement).toBe(parent);
  await act(async () => root.unmount()); host.remove();
});
it('keeps root notes selected when unchecking a folder from All and exposes label-in-name counts', async () => {
  const host = document.createElement('div'); const root = createRoot(host); let value: GraphOptions = { ...options, folderPaths: null };
  function Probe() { const [current, set] = React.useState(value); return React.createElement(GraphFilters, { tree, tags: [], options: current, onChange: next => { value = next; set(next); } }); }
  await act(async () => root.render(React.createElement(Probe)));
  const parent = host.querySelector<HTMLInputElement>('[data-folder-path="Tech"]')!;
  expect(parent.getAttribute('aria-label')).toMatch(/^Tech, 2 notes/);
  await act(async () => parent.click()); expect(value.folderPaths).toEqual([ROOT_FOLDER]);
  const all = host.querySelector<HTMLInputElement>('fieldset input')!;
  expect(all.indeterminate).toBe(true);
  await act(async () => parent.click()); expect(all.checked).toBe(true); expect(all.indeterminate).toBe(false);
  await act(async () => parent.click());
  const rootBox = host.querySelector<HTMLInputElement>('input[aria-label="Root (no folder)"]')!;
  expect(rootBox.checked).toBe(true); await act(async () => rootBox.click()); expect(value.folderPaths).toEqual([]);
  await act(async () => root.unmount());
});
