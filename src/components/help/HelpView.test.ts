// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { HelpView } from './HelpView';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.textContent = ''; vi.unstubAllGlobals(); });

async function mount(props: Partial<React.ComponentProps<typeof HelpView>> = {}, width = 1280) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 767px') ? width < 768 : false, addEventListener() {}, removeEventListener() {} }));
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const handlers = { onTopicChange: vi.fn(), onClose: vi.fn(), onShowMe: vi.fn() };
  let topic = props.topic ?? 'first-5-minutes';
  const render = async () => root!.render(React.createElement(HelpView, { appMode: 'desktop', ...handlers, ...props, topic,
    onTopicChange: (slug: string) => { handlers.onTopicChange(slug); topic = slug; void render(); } }));
  await act(render);
  return handlers;
}
const dialog = () => document.querySelector<HTMLElement>('[role=dialog]')!;
const topicButtons = () => [...dialog().querySelectorAll<HTMLButtonElement>('nav[aria-label="Help topics"] button')];
const type = async (input: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

it('opens full size with search, a Web | Tablet | Phone switch and grouped topics', async () => {
  await mount();
  expect(document.getElementById(dialog().getAttribute('aria-labelledby')!)?.textContent).toBe('Help');
  expect(dialog().querySelector('input[aria-label="Search help"]')).not.toBeNull();
  expect([...dialog().querySelectorAll('[role=group][aria-label="Help platform"] button')].map(b => b.textContent)).toEqual(['Web', 'Tablet', 'Phone']);
  const nav = dialog().querySelector('nav[aria-label="Help topics"]')!;
  expect([...nav.querySelectorAll('h3')].map(h => h.textContent)).toEqual(['Start here', 'Features']);
  expect(topicButtons().slice(0, 2).map(b => b.textContent)).toEqual(['First 5 minutes', "What's new"]);
  expect(dialog().querySelector('article h2')?.textContent).toBe('First 5 minutes');
});

it('narrows the topic list as you search', async () => {
  await mount();
  await type(dialog().querySelector<HTMLInputElement>('input[aria-label="Search help"]')!, 'tags');
  expect(topicButtons()[0].textContent).toBe('Tags');
  await type(dialog().querySelector<HTMLInputElement>('input[aria-label="Search help"]')!, 'zzzz');
  expect(topicButtons()).toHaveLength(0);
  expect(dialog().textContent).toContain('No topics match');
});

it('Show me hands the topic target to the app, and related links change the topic', async () => {
  const handlers = await mount({ topic: 'tags' });
  await act(async () => [...dialog().querySelectorAll('button')].find(b => b.textContent === 'Show me')!.click());
  expect(handlers.onShowMe).toHaveBeenCalledWith('notes-tags');
  const related = [...dialog().querySelectorAll<HTMLButtonElement>('[aria-label="Related topics"] button')];
  expect(related.map(b => b.textContent)).toContain('Linking notes');
  await act(async () => related.find(b => b.textContent === 'Linking notes')!.click());
  expect(handlers.onTopicChange).toHaveBeenLastCalledWith('linking-notes');
  expect(dialog().querySelector('article h2')?.textContent).toBe('Linking notes');
});

it('switches platform instructions, with Tablet falling back to Phone', async () => {
  await mount({ topic: 'backlog' });
  const choose = (label: string) => act(async () => [...dialog().querySelectorAll<HTMLButtonElement>('[aria-label="Help platform"] button')].find(b => b.textContent === label)!.click());
  expect(dialog().querySelector('article')!.textContent).toContain('Open Backlog from the side menu');
  await choose('Tablet');
  expect(dialog().querySelector('article')!.textContent).toContain('Tap Backlog in the bottom bar');
  await choose('Phone');
  expect(dialog().querySelector('article')!.textContent).toContain('Tap Backlog in the bottom bar');
});

it('renders screenshots with alt text', async () => {
  await mount({ topic: 'tags' });
  const image = dialog().querySelector<HTMLImageElement>('article img');
  expect(image?.getAttribute('alt')).toBe('Tags section with a #project filter');
});

it('on a phone shows the topic list first, then the article with Back', async () => {
  await mount({ appMode: 'mobile-app' }, 390);
  expect(dialog().querySelector('article')).toBeNull();
  await act(async () => topicButtons().find(b => b.textContent === 'Sync')!.click());
  expect(dialog().querySelector('article h2')?.textContent).toBe('Sync');
  expect(dialog().querySelector('article')!.textContent).toContain('Connect and sync');
  await act(async () => [...dialog().querySelectorAll('button')].find(b => b.textContent === 'All topics')!.click());
  expect(dialog().querySelector('article')).toBeNull();
});

it('closes with Close', async () => {
  const handlers = await mount();
  await act(async () => dialog().querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click());
  expect(handlers.onClose).toHaveBeenCalled();
});
