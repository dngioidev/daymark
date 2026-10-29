// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { ViewSwitch } from './ViewSwitch';

it('announces presentation and supports one tab stop, click and wrapping arrow keys', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); const changes: string[] = [];
  function Harness() {
    const [value, setValue] = React.useState<'list' | 'graph'>('list');
    return React.createElement(ViewSwitch, { value, onChange: next => { changes.push(next); setValue(next); } });
  }
  try {
    act(() => root.render(React.createElement(Harness)));
    const group = host.querySelector('[role=radiogroup]')!;
    expect(group.getAttribute('aria-label')).toBe('Notes presentation');
    expect(group.className).toContain('hidden md:inline-flex');
    const radios = host.querySelectorAll<HTMLButtonElement>('[role=radio]');
    expect([...radios].map(r => [r.textContent, r.getAttribute('aria-checked'), r.tabIndex])).toEqual([['List', 'true', 0], ['Graph', 'false', -1]]);
    act(() => radios[0].focus());
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
      expect(document.activeElement?.getAttribute('aria-checked')).toBe('true');
    }
    act(() => radios[1].click());
    expect(changes).toEqual(['graph', 'list', 'graph', 'list', 'graph']);
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
  } finally { act(() => root.unmount()); host.remove(); }
});

it('uses a labelled group and gives the presentation switch the graph button height', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { ViewSwitch } = await import('./ViewSwitch');
  const host = document.createElement('div'); host.innerHTML = renderToStaticMarkup(React.createElement(ViewSwitch, { value: 'graph', onChange: () => {}, size: 'toolbar' }));
  for (const radio of host.querySelectorAll('[role=radio]')) expect(radio.className).toContain('h-11');
  for (const radio of host.querySelectorAll('[role=radio]')) expect(radio.className).not.toContain('sm:h-9');
});
