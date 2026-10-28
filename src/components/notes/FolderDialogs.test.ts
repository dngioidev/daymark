import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('../ui/Dialog', async original => ({ ...await original<typeof import('../ui/Dialog')>(), Dialog: ({ children }: { children: React.ReactNode }) => children }));
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
