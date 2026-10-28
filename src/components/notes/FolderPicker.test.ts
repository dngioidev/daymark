import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { FolderPicker } from './FolderPicker';
it('shows the current hierarchy and an accessible move action', () => {
  const html = renderToStaticMarkup(React.createElement(FolderPicker, { tree: [], value: "Tech/Java", onChange: vi.fn() }));
  expect(html).toContain('Tech / Java');
  expect(html).toContain('Move to folder');
  expect(html).toContain('aria-haspopup="menu"');
});
