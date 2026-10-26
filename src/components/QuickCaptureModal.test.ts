// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { QuickCaptureModal } from './QuickCaptureModal';
import { DEFAULT_SETTINGS } from '../utils/defaultData';

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); localStorage.clear(); });
it('switches between dated capture and backlog capture with category suggestions', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const capture = vi.fn(), backlog = vi.fn(), close = vi.fn();
  const change = (input: HTMLInputElement, value: string) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  try {
    await act(async () => root.render(React.createElement(QuickCaptureModal, {
      isOpen: true, onClose: close, headings: ['Work'], statuses: DEFAULT_SETTINGS.statuses,
      simulatedToday: '2026-10-26', targetDate: '2026-10-27', onCapture: capture,
      onCaptureBacklog: backlog, categories: ['Ideas'],
    })));
    expect(document.querySelector('#capture-section')).not.toBeNull();
    act(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Backlog')!.click());
    expect(document.querySelector('#capture-section')).toBeNull();
    expect(document.querySelector('#capture-status')).toBeNull();
    expect([...document.querySelectorAll('datalist option')].map((o) => o.getAttribute('value'))).toEqual(['Ideas', 'Work']);
    change(document.querySelector('#capture-title')!, '  Plan the garden  ');
    change(document.querySelector('#capture-category')!, '  Personal  ');
    act(() => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(backlog).toHaveBeenCalledWith({ title: 'Plan the garden', description: undefined, category: 'Personal' });
    expect(capture).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); }
});
