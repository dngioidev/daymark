// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HelpTab } from './HelpTab';
const containers: HTMLDivElement[] = [];
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterEach(() => { containers.splice(0).forEach(el => el.remove()); vi.unstubAllGlobals(); });

it('offers topics and switches the displayed platform instructions offline', async () => {
  const el = document.createElement('div'); document.body.append(el); containers.push(el);
  const root = createRoot(el);
  await act(async () => root.render(React.createElement(HelpTab, { appMode: 'desktop' })));
  expect(el.textContent).toContain('First 5 minutes');
  expect(el.textContent).toContain('This is your notebook for the day');
  const mobile = [...el.querySelectorAll('button')].find(b => b.textContent === 'Phone')!;
  await act(async () => mobile.click());
  expect(el.textContent).toContain('Open the Today tab');
  expect(el.textContent).not.toContain('This is your notebook for the day');
  const backlog = [...el.querySelectorAll('button')].find(b => b.textContent === 'Backlog')!;
  await act(async () => backlog.click());
  expect(el.textContent).toContain('Tap Backlog in the bottom bar');
  await act(async () => root.unmount());
});

it('defaults to Phone instructions in the dedicated mobile app', async () => {
  const el = document.createElement('div'); document.body.append(el); containers.push(el);
  const root = createRoot(el);
  await act(async () => root.render(React.createElement(HelpTab, { appMode: 'mobile-app' })));
  expect(el.textContent).toContain('Open the Today tab');
  const topics = el.querySelector<HTMLSelectElement>('select[aria-label="Help topic"]');
  expect(topics).not.toBeNull();
  await act(async () => { topics!.value = 'backlog'; topics!.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(el.textContent).toContain('Tap Backlog in the bottom bar');
  await act(async () => root.unmount());
});
