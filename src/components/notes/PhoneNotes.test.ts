// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { PhoneNotes } from './PhoneNotes';
it('returns Back to the list heading when the note row is no longer available', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const render = (pane: 'list' | 'editor') => React.createElement(React.Fragment, null, React.createElement('h1', { 'data-notes-heading': true, tabIndex: -1 }, 'Notes'), React.createElement(PhoneNotes, { pane, navigation: React.createElement('div', { role: 'tree' }), editor: React.createElement('button', null, 'Editor') }));
  try { act(() => root.render(render('editor'))); act(() => host.querySelector<HTMLButtonElement>('button')!.focus()); act(() => root.render(render('list'))); expect(document.activeElement).toBe(host.querySelector('h1')); }
  finally { act(() => root.unmount()); host.remove(); }
});
