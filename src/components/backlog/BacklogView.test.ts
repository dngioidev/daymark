// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { BacklogView } from './BacklogView';
import { FeedbackHost } from '../ui/feedback';
import type { BacklogData } from '../../types/daymark';

const props = () => ({ today: '2026-10-26', headings: ['Work'], onAdd: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn(), onRestore: vi.fn(), onReorder: vi.fn(), onPick: vi.fn() });
const backlog: BacklogData = { items: [
  { id: 'plain', title: 'Unlabelled task', order: 1, createdAt: '', updatedAt: '' },
  { id: 'z', title: 'Garden', category: 'Personal', order: 1, createdAt: '', updatedAt: '' },
  { id: 'a', title: 'Research', category: 'Ideas', order: 1, createdAt: '', updatedAt: '' },
] };
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });
it('groups categories alphabetically with unlabelled last and explains an empty backlog', () => {
  const html = renderToStaticMarkup(React.createElement(BacklogView, { ...props(), backlog }));
  expect(html.indexOf('Research')).toBeLessThan(html.indexOf('Garden'));
  expect(html.indexOf('Garden')).toBeLessThan(html.indexOf('Unlabelled task'));
  expect(html).toContain('max-w-[1800px]');
  const empty = renderToStaticMarkup(React.createElement(BacklogView, { ...props(), backlog: { items: [] } }));
  expect(empty).toContain('undated tasks');
});
it('validates pick dates and offers delete Undo', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host), handlers = props();
  try {
    await act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(BacklogView, { ...handlers, backlog: { items: [backlog.items[0]] } }), React.createElement(FeedbackHost))));
    const date = host.querySelector<HTMLInputElement>('input[type="date"]')!;
    expect(date.min).toBe('2026-10-26'); expect(date.value).toBe('2026-10-26');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(date, '2026-10-25');
      date.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => date.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(handlers.onPick).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('today or a later day');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(date, '2026-10-26');
      date.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => date.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(handlers.onPick).toHaveBeenCalledWith('plain', '2026-10-26');
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Delete')!.click());
    expect(handlers.onRemove).toHaveBeenCalledWith('plain');
    act(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Undo')!.click());
    expect(handlers.onRestore).toHaveBeenCalledWith('plain');
  } finally { await act(async () => root.unmount()); }
});
