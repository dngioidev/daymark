// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { NotesStrip } from './NotesStrip';
it('marks the current top-level folder shortcut, including a current descendant', () => {
  const host = document.createElement('div'); host.innerHTML = renderToStaticMarkup(React.createElement(NotesStrip, {
    tree: [{ path: 'Work', name: 'Work', ownCount: 0, totalCount: 1, children: [] }, { path: 'Other', name: 'Other', ownCount: 0, totalCount: 1, children: [] }], currentFolder: 'work/Deep',
    onSearch: vi.fn(), onNewNote: vi.fn(), onNewFolder: vi.fn(), onFolder: vi.fn(), onExpand: vi.fn(),
  }));
  const selected = host.querySelector('[aria-current=true]'); expect(selected?.getAttribute('data-folder-path')).toBe('Work');
  expect(selected?.className).toContain('bg-stone-200'); expect(host.querySelectorAll('[aria-current=true]')).toHaveLength(1);
});
