// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { dismissToast, FeedbackHost, showToast } from './feedback';

afterEach(() => { dismissToast(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

it.each(['Moved to backlog.', 'Moved to Ideas.'])('keeps the refusal visible when Undo for "%s" encounters a concurrent edit', async (message) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(FeedbackHost)));
    act(() => showToast(message, { action: { label: 'Undo', onClick: () => showToast("Can't undo: the list changed since.", { tone: 'error' }) } }));
    act(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Undo')!.click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Can't undo: the list changed since.");
    expect(document.querySelector('[role="status"]')).toBeNull();
  } finally { await act(async () => root.unmount()); }
});

it('dismisses the old toast after an action that does not create another message', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  let restored = false;
  try {
    await act(async () => root.render(React.createElement(FeedbackHost)));
    act(() => showToast('Moved to backlog.', { action: { label: 'Undo', onClick: () => { restored = true; } } }));
    act(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Undo')!.click());
    expect(restored).toBe(true);
    expect(document.querySelector('[role="status"]')).toBeNull();
  } finally { await act(async () => root.unmount()); }
});
