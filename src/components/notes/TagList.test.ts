// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { TagList } from './TagList';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = ''; });
const rows = [{ tag: 'project', name: 'project', depth: 0, count: 3 }, { tag: 'project/daymark', name: 'daymark', depth: 1, count: 2 }];
async function mount(props: Partial<React.ComponentProps<typeof TagList>> = {}) {
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const onSelectTag = vi.fn();
  await act(async () => root!.render(React.createElement(TagList, { rows, onSelectTag, ...props })));
  return { host, onSelectTag };
}

it('lists tags with counts, indents nested ones and selects on click', async () => {
  const { host, onSelectTag } = await mount({ activeTag: 'project' });
  const region = host.querySelector('[role=region][aria-label=Tags]')!;
  const buttons = [...region.querySelectorAll<HTMLButtonElement>('button[data-tag]')];
  expect(buttons.map(b => b.textContent)).toEqual(['project3', 'daymark2']);
  expect(buttons.map(b => b.getAttribute('aria-label'))).toEqual(['#project, 3 notes', '#project/daymark, 2 notes']);
  expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
  expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
  expect(Number.parseFloat(buttons[1].style.paddingLeft)).toBeGreaterThan(Number.parseFloat(buttons[0].style.paddingLeft));
  act(() => buttons[1].click());
  expect(onSelectTag).toHaveBeenCalledWith('project/daymark');
});

it('collapses behind its heading and explains when there are no tags', async () => {
  const { host } = await mount({ rows: [] });
  expect(host.textContent).toContain('Type #word in a note to tag it.');
  const toggle = host.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  act(() => toggle.click());
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(host.textContent).not.toContain('Type #word');
});

it('on a reveal it focuses the first tag and reports that the reveal was shown (review fix)', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { callback(); return 0; });
  const onRevealed = vi.fn();
  const { host } = await mount({ revealSignal: 2, onRevealed });
  expect(document.activeElement).toBe(host.querySelector('button[data-tag]'));
  expect(onRevealed).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});
