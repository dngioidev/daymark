// @vitest-environment jsdom
import React, { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

it('opens without changing background inset styles or scroll offsets and focuses without scrolling', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  const host = document.createElement('div'); host.id = 'root';
  host.style.paddingTop = 'var(--dm-safe-top)'; host.scrollTop = 24;
  document.body.append(host); const root = createRoot(host);
  const bodyStyle = document.body.getAttribute('style');
  const rootStyle = host.getAttribute('style');
  const bodyScroll = document.body.scrollTop;
  const focus = vi.spyOn(HTMLElement.prototype, 'focus');
  try {
    act(() => root.render(React.createElement(Dialog, { isOpen: true, title: 'Settings', fixedSettingsSize: true, onClose: () => {}, children: 'Content' })));
    expect(host.hasAttribute('inert')).toBe(true);
    expect(document.body.getAttribute('style')).toBe(bodyStyle);
    expect(host.getAttribute('style')).toBe(rootStyle);
    expect(host.scrollTop).toBe(24);
    expect(document.body.scrollTop).toBe(bodyScroll);
    expect(document.activeElement).toBe(document.querySelector('[role="dialog"]'));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  } finally { act(() => root.unmount()); host.remove(); focus.mockRestore(); vi.unstubAllGlobals(); }
});

it('resolves the latest return-focus ref on close and uses suffix important drawer alignment', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.stubGlobal('requestAnimationFrame', () => 1);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); let target: React.RefObject<HTMLElement | null>;
  function Harness() { const [open, setOpen] = useState(false); target = useRef<HTMLElement>(null); return React.createElement(React.Fragment, null,
    React.createElement('button', { id: 'first', onClick: event => { target.current = event.currentTarget; setOpen(true); } }, 'Open'),
    React.createElement('button', { id: 'last' }, 'Latest target'), open && React.createElement(Dialog, { isOpen: true, title: 'Drawer', variant: 'drawer', returnFocusRef: target, onClose: () => setOpen(false), children: 'Content' })); }
  try {
    act(() => root.render(React.createElement(Harness))); act(() => host.querySelector<HTMLButtonElement>('#first')!.click());
    const dialog = document.querySelector('[role=dialog]')!; expect(dialog.parentElement?.className).toContain('justify-start!');
    target!.current = host.querySelector('#last'); act(() => document.querySelector<HTMLButtonElement>('[aria-label=Close]')!.click());
    expect(document.activeElement).toBe(host.querySelector('#last'));
  } finally { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
