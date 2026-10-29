// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StandaloneNotesView } from './StandaloneNotesView';
import type { StandaloneNote } from '../types/daymark';
vi.mock('./notes/RichNoteEditor', () => ({ default: () => React.createElement('div', null, 'Editor') }));
vi.mock('./ui/feedback', () => ({ showToast: vi.fn(), confirmDialog: vi.fn(async () => true) }));
let root: Root; let host: HTMLDivElement; let frames: FrameRequestCallback[];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  frames = []; vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  localStorage.clear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function settleFrames() { await act(async () => { for (let i = 0; i < 6 && frames.length; i++) { const batch = frames.splice(0); for (const callback of batch) callback(0); } }); }
async function click(el: HTMLElement) { await act(async () => el.click()); }
async function change(el: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => { const prototype = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
}
it.each([[1440, 'rename'], [1440, 'move'], [900, 'rename'], [900, 'move']] as const)('restores the updated folder row after a real %s px %s dialog', async (width, action) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  const note = (id: string, folder: string): StandaloneNote => ({ id, title: id, folder, content: '', tags: [], createdAt: '2026-10-29', updatedAt: '2026-10-29' });
  function Harness() { const [notes, setNotes] = useState([note('Work note', 'Work/Child'), note('Archive note', 'Archive')]); return React.createElement(StandaloneNotesView, { notes, onUpdateNotes: setNotes }); }
  await act(async () => root.render(React.createElement(Harness)));
  if (width === 900) await click([...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === 'Notes')!);
  await settleFrames();
  const folder = document.querySelector<HTMLElement>('[data-folder-path="Work"]')!;
  await act(async () => { folder.focus(); folder.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true })); });
  const item = [...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(b => b.textContent === (action === 'rename' ? 'Rename folder' : 'Move folder'))!;
  await click(item); await settleFrames();
  const dialog = document.querySelector('[role=dialog]')!;
  await change(dialog.querySelector<HTMLInputElement | HTMLSelectElement>(action === 'rename' ? 'input' : 'select')!, action === 'rename' ? 'Renamed' : 'Archive');
  await act(async () => dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await settleFrames();
  expect(document.activeElement?.getAttribute('data-folder-path')).toBe(action === 'rename' ? 'Renamed' : 'Archive/Work');
  expect((document.activeElement as HTMLElement).tabIndex).toBe(0);
  const restored = document.activeElement;
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
  expect(document.activeElement?.getAttribute('role')).toBe('treeitem');
  expect(document.activeElement).not.toBe(restored);
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
  expect(document.activeElement).toBe(restored);
});
