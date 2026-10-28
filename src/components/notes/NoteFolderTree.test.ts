// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { NoteFolderTree } from './NoteFolderTree';
const tree = [{ path: 'Tech', name: 'Tech', ownCount: 1, totalCount: 3, children: [{ path: 'Tech/Java', name: 'Java', ownCount: 2, totalCount: 2, children: [] }] }];
it.each([false, true])('renders nested labelled rows with counts and selection (compact=%s)', compact => {
  const html = renderToStaticMarkup(React.createElement(NoteFolderTree, { tree, selectedPath: "Tech/Java", onSelect: vi.fn(), onFolderAction: vi.fn(), compact }));
  const doc = document.createElement('div'); doc.innerHTML = html;
  expect(doc.querySelector('ul[aria-label="Folders"]')).not.toBeNull();
  expect(doc.querySelector('[aria-label="Tech, 3 notes"]')).not.toBeNull();
  expect(doc.querySelector('[aria-current="true"]')?.textContent).toContain('Java');
  expect(doc.querySelector('[aria-expanded="true"]')).not.toBeNull();
  expect(html).toContain('min-h-11');
});
it('minimizes to named folder icons with tooltips', () => {
  const html = renderToStaticMarkup(React.createElement(NoteFolderTree, { tree, selectedPath: "all", onSelect: vi.fn(), onFolderAction: vi.fn(), minimized: true }));
  expect(html).toContain('aria-label="Tech, 3 notes"');
  expect(html).toContain('title="Tech"');
  expect(html).toContain('sr-only');
});
