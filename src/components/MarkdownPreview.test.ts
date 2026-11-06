// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { MarkdownPreview } from './MarkdownPreview';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it.each(['---', '----'])('renders opening %s dividers and all Daily Note text', async rule => {
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(MarkdownPreview, { content: `${rule}\n\nFirst section\n\n${rule}\n\nLast section` })));
    expect(host.querySelectorAll('hr')).toHaveLength(2);
    expect(host.textContent).toContain('First section');
    expect(host.textContent).toContain('Last section');
  } finally {
    await act(async () => root.unmount());
  }
});

it.each(['\n', '\r\n'])('keeps a real metadata header while rendering body dividers (%j)', async newline => {
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    const content = ['---', 'date: 2026-11-03', 'type: daily', '---', '', '---', '', 'First section', '', '---', '', 'Last section'].join(newline);
    await act(async () => root.render(React.createElement(MarkdownPreview, { content })));
    expect(host.querySelectorAll('hr')).toHaveLength(2);
    expect(host.textContent).toContain('2026-11-03');
    expect(host.textContent).toContain('First section');
    expect(host.textContent).toContain('Last section');
  } finally {
    await act(async () => root.unmount());
  }
});
