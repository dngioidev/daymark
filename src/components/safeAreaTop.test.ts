// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SideRail } from './SideRail';
import { StandaloneNotesView } from './StandaloneNotesView';
import { NotesStrip } from './notes/NotesStrip';
import { NotesDrawer } from './notes/NotesDrawer';
import { RelatedOverlay } from './notes/RelatedPanel';
import { Dialog } from './ui/Dialog';
import type { StandaloneNote } from '../types/daymark';

vi.mock('./notes/RichNoteEditor', () => ({ default: () => React.createElement('div', null, 'Editor') }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
const noop = () => {};
const notes: StandaloneNote[] = [{ id: 'one', title: 'One', folder: 'General', content: '', tags: [], createdAt: '2026-11-01', updatedAt: '2026-11-01' }];
beforeEach(() => {
  document.documentElement.style.setProperty('--dm-safe-top', '24px');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  host = document.createElement('div'); host.id = 'root'; document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); localStorage.clear();
  document.documentElement.style.removeProperty('--dm-safe-top'); vi.restoreAllMocks();
});
async function render(node: React.ReactNode) { await act(async () => root.render(node)); }
function expectInset(element: Element | null) {
  expect(element).not.toBeNull();
  // jsdom cannot resolve env()/Tailwind layout; guard the rendered inset contract.
  expect(`${element!.getAttribute('class')} ${element!.getAttribute('style')}`).toContain('--dm-safe-top');
}

it('protects the side rail title and Notes column header at desktop widths', async () => {
  await render(React.createElement(React.Fragment, null,
    React.createElement(SideRail, { activeTab: 'notes', onTabChange: noop, onOpenQuickCapture: noop, onOpenSearch: noop, onOpenSettings: noop, onOpenSync: noop, syncStatus: 'synced', carriedAlertCount: 0, todayLabel: 'Today', side: 'left', collapsed: false, onToggleCollapsed: noop }),
    React.createElement(StandaloneNotesView, { notes, onUpdateNotes: noop })));
  expectInset(host.querySelector('[data-rail-part="title"]'));
  expectInset(host.querySelector('[aria-label="Minimize notes column"]'));
  expectInset(host.querySelector('#note-title')?.closest('.shrink-0') ?? null);
  expectInset(host.querySelector('[aria-label="Related panel"], [aria-label="Related minimized"]'));
});

it('protects the Notes strip when it sits at the top edge', async () => {
  await render(React.createElement(NotesStrip, { tree: [], onSearch: noop, onNewNote: noop, onNewFolder: noop, onFolder: noop, onExpand: noop }));
  expectInset(host.querySelector('[aria-label="Notes shortcuts"]'));
});

it('lets the strip reuse the inset already reserved by the column header', async () => {
  await render(React.createElement(NotesStrip, { topInset: false, tree: [], onSearch: noop, onNewNote: noop, onNewFolder: noop, onFolder: noop, onExpand: noop }));
  expect(host.querySelector('[aria-label="Notes shortcuts"]')?.className).not.toContain('--dm-safe-top');
});

it('does not add a second inset below the phone shell header', async () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  await render(React.createElement(StandaloneNotesView, { compact: true, notes, onUpdateNotes: noop }));
  const row = host.querySelector<HTMLButtonElement>('[data-note-id="one"]')!;
  await act(async () => row.click());
  const header = host.querySelector('#note-title')?.closest('.shrink-0');
  expect(header).toBeTruthy();
  expect(header!.className).not.toContain('--dm-safe-top');
});

it('reserves the Related overlay inset once around its scrolling contents', async () => {
  await render(React.createElement(RelatedOverlay, { suggestions: [], linked: { outgoing: [], incoming: [] }, hidden: [], onLink: noop, onDismiss: noop, onRestore: noop, onOpen: noop, minimized: false, onToggleMinimized: noop, onClose: noop }));
  const overlay = host.querySelector('[aria-label="Related"]')!;
  expectInset(overlay);
  expect(overlay.querySelector('aside')!.className).not.toContain('--dm-safe-top');
});

it.each(['sm', 'md', 'lg', 'xl'] as const)('protects the %s dialog header above the phone breakpoint', async size => {
  await render(React.createElement(Dialog, { isOpen: true, onClose: noop, title: 'Settings', size, children: 'Body' }));
  expectInset(document.querySelector('[role="dialog"] h2')?.parentElement?.parentElement ?? null);
});

it('protects the drawer header at every width', async () => {
  await render(React.createElement(NotesDrawer, { onClose: noop, returnFocusRef: { current: null }, children: 'Notes list' }));
  expectInset(document.querySelector('[role="dialog"] h2')?.parentElement?.parentElement ?? null);
});

it('protects the graph toolbar and filter column', async () => {
  await render(React.createElement(StandaloneNotesView, { notes, onUpdateNotes: noop }));
  const graph = host.querySelector<HTMLButtonElement>('[role="radio"][aria-label="Graph"]')
    ?? [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(button => button.textContent === 'Graph')!;
  await act(async () => { graph.click(); await import('./notes/graph/GraphView'); });
  expectInset(host.querySelector('[aria-label="Graph controls"]'));
  expectInset(host.querySelector('[aria-label="Graph filters"]'));
});

it('defines one shared inset with the Capacitor fallback for zero env values', () => {
  const css = readFileSync('src/index.css', 'utf8');
  expect(css.match(/--dm-safe-top\s*:/g)).toHaveLength(1);
  expect(css).toContain('max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px))');
});
