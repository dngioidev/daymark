import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('../ui/Dialog', async original => ({ ...await original<typeof import('../ui/Dialog')>(), Dialog: ({ children, description }: { children: React.ReactNode; description: React.ReactNode }) => React.createElement('div', null, React.createElement('p', null, description), children) }));
import { FolderDialogs, deleteFolderMessage, mergeFolderMessage } from './FolderDialogs';
it('delete states the count and destination, preserving notes', () => {
  expect(deleteFolderMessage('Tech/Java', 3)).toMatch(/3 notes.*Tech.*No notes.*deleted/);
  expect(deleteFolderMessage('Tech', 1)).toContain('Notes');
});
it('merge names the destination and affected note count', () => {
  expect(mergeFolderMessage('Tech/Java', 5)).toMatch(/5 notes.*Tech\/Java/);
});
it('uses a valid browser pattern that rejects slashes in folder names', () => {
  const html = renderToStaticMarkup(React.createElement(FolderDialogs, { action: 'new', path: '', tree: [], onClose: vi.fn(), onSubmit: vi.fn() }));
  const pattern = html.match(/pattern="([^"]+)"/)![1];
  const expression = new RegExp(`^(?:${pattern})$`, 'v');
  expect(expression.test('Java')).toBe(true);
  expect(expression.test('Tech/Java')).toBe(false);
});

it('pluralizes merge and delete counts', () => {
  expect(mergeFolderMessage('Tech', 1)).toBe('1 note is affected by merging into Tech. All notes will be kept.');
  expect(mergeFolderMessage('Tech', 2)).toContain('2 notes are affected');
  expect(deleteFolderMessage('Tech', 1)).toContain('1 note moves to Notes');
  expect(deleteFolderMessage('Tech', 2)).toContain('2 notes move to Notes');
});
it.each([['Tech/Java', 'In Tech'], ['Tech', 'At the top level']])('rename context for %s names its parent', (path, description) => {
  const html = renderToStaticMarkup(React.createElement(FolderDialogs, { action: 'rename', path, tree: [], onClose: vi.fn(), onSubmit: vi.fn() }));
  // Render the actual description through the Dialog boundary used by this form.
  expect(html).toContain(`>${description}<`);
});
it.each([['Tech/Java', 'In Tech'], ['Tech', 'At the top level']])('move context for %s names its parent', (path, description) => {
  const html = renderToStaticMarkup(React.createElement(FolderDialogs, { action: 'move', path, tree: [], onClose: vi.fn(), onSubmit: vi.fn() }));
  expect(html).toContain(`>${description}<`);
});
