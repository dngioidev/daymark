// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { TodayView } from './TodayView';
import { DEFAULT_SETTINGS } from '../utils/defaultData';
import type { DailyDocument, TaskItem } from '../types/daymark';

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

const sectionMoveCases: { width: number; label: string; extra: Partial<TaskItem>; available: boolean }[] = [1440, 390].flatMap((width) => [
  { width, label: 'open task', extra: {}, available: true },
  { width, label: 'done task', extra: { status: 'done' }, available: true },
  { width, label: 'done-later copy', extra: { status: 'done', doneLaterDate: '2026-10-22' }, available: false },
  { width, label: 'backlog-closed copy', extra: { status: 'done', movedToBacklogDate: '2026-10-22' }, available: false },
]);

it.each(sectionMoveCases)('offers section moves for $label at width $width', async ({ width, extra, available }) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  const currentDocument: DailyDocument = {
    date: '2026-10-21', type: 'daily', updatedAt: '', headings: [
      { name: 'Work', items: [{ id: 'move', title: 'Prepare', status: 'in-progress', createdDate: '2026-10-21', originalNoteDate: '2026-10-21', heading: 'Work', order: 1, historyLog: [], ...extra }] },
      { name: 'Ideas', items: [] },
    ],
  };
  const move = vi.fn();
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(TodayView, {
      currentDocument, allDocs: [currentDocument], simulatedToday: currentDocument.date,
      statuses: DEFAULT_SETTINGS.statuses, agingThresholds: DEFAULT_SETTINGS.agingThresholds,
      defaultHeadings: DEFAULT_SETTINGS.defaultHeadings,
      onDateChange: vi.fn(), onUpdateDocument: vi.fn(), onPatchDocument: vi.fn(),
      onOpenHistoricalModal: vi.fn(), onOpenHistoryDrawer: vi.fn(), onQuickHistoricalDone: vi.fn(), onTriggerRollover: vi.fn(),
      onMoveTask: vi.fn(), onMoveToSection: move,
    })));
    if (extra.status === 'done') act(() => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Done (1)'))!.click());
    const openDialog = () => {
      act(() => [...host.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'More actions for "Prepare"')!.click());
      const items = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
      const destination = items.find((b) => b.textContent === 'Move to section…');
      if (!available) { expect(destination).toBeUndefined(); return null; }
      expect(destination).toBeDefined();
      expect(items.indexOf(destination!)).toBe(items.findIndex((b) => b.textContent === 'Move to date…') + 1);
      act(() => destination!.click());
      return document.querySelector<HTMLElement>('[role="dialog"]')!;
    };
    if (!available) { openDialog(); return; }
    let dialog = openDialog()!;
    expect(dialog).not.toBeNull();
    expect([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Work')?.disabled).toBe(true);
    expect([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Move')?.disabled).toBe(true);
    act(() => dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(move).not.toHaveBeenCalled();
    act(() => [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Ideas')!.click());
    expect(move).toHaveBeenLastCalledWith('move', 'Ideas');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    dialog = openDialog()!;
    const input = dialog.querySelector<HTMLInputElement>('input')!;
    expect(dialog.querySelector(`label[for="${input.id}"]`)?.textContent).toBe('New section');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, ' Personal ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(move).toHaveBeenLastCalledWith('move', 'Personal');
  } finally { await act(async () => root.unmount()); }
});

it('excludes backlog-closed copies from the done count and Finished list', () => {
  const currentDocument: DailyDocument = {
    date: '2026-10-21', type: 'daily', updatedAt: '',
    headings: [{ name: 'Work', items: [{
      id: 'backlog-closed', title: 'Moved away', status: 'done', movedToBacklogDate: '2026-10-23',
      createdDate: '2026-10-20', originalNoteDate: '2026-10-20', heading: 'Work', order: 1, historyLog: [],
    }] }],
  };
  const html = renderToStaticMarkup(React.createElement(TodayView, {
    currentDocument, allDocs: [currentDocument], simulatedToday: currentDocument.date,
    statuses: DEFAULT_SETTINGS.statuses, agingThresholds: DEFAULT_SETTINGS.agingThresholds,
    defaultHeadings: DEFAULT_SETTINGS.defaultHeadings,
    onDateChange: vi.fn(), onUpdateDocument: vi.fn(), onPatchDocument: vi.fn(),
    onOpenHistoricalModal: vi.fn(), onOpenHistoryDrawer: vi.fn(),
    onQuickHistoricalDone: vi.fn(), onTriggerRollover: vi.fn(),
  }));
  const aside = html.match(/<aside\b[^>]*aria-label="Day at a glance"[\s\S]*?<\/aside>/)![0];
  expect(aside).toMatch(/<dd\b[^>]*>0<\/dd>\s*<dt\b[^>]*>Done<\/dt>/);
  expect(aside).not.toContain('Moved away');
  expect(aside).toContain("Nothing yet. Tick a task when it&#x27;s done.");
});

it('renders the full-width list, accessible section toggle and fuller desktop sidebar', () => {
  const currentDocument: DailyDocument = {
    date: '2026-10-21', type: 'daily', updatedAt: '',
    headings: [{ name: 'Work', items: [], notesContent: 'Meeting notes' }],
  };
  const future: DailyDocument = {
    ...currentDocument, date: '2026-10-24',
    headings: [{ name: 'Work', items: [{
      id: 'future', title: 'Plan', status: 'not-started', createdDate: '2026-10-21',
      originalNoteDate: '2026-10-24', heading: 'Work', order: 0, historyLog: [],
    }] }],
  };
  currentDocument.headings = future.headings;
  const html = renderToStaticMarkup(React.createElement(TodayView, {
    currentDocument, allDocs: [currentDocument, future], simulatedToday: '2026-10-21',
    statuses: DEFAULT_SETTINGS.statuses, agingThresholds: DEFAULT_SETTINGS.agingThresholds,
    defaultHeadings: DEFAULT_SETTINGS.defaultHeadings,
    habitsSlot: React.createElement('div', { 'data-habits-slot': true }, 'Daily habits slot'),
    onDateChange: vi.fn(), onUpdateDocument: vi.fn(), onPatchDocument: vi.fn(),
    onOpenHistoricalModal: vi.fn(), onOpenHistoryDrawer: vi.fn(),
    onQuickHistoricalDone: vi.fn(), onTriggerRollover: vi.fn(),
  }));
  expect(html).toContain('max-w-[1800px]');
  expect(html).toContain('Daily habits slot');
  expect(html.indexOf('Daily habits slot')).toBeLessThan(html.indexOf('Last 7 days'));
  expect(html).toContain('xl:grid-cols-[minmax(0,1fr)_18rem]');
  expect(html).not.toContain('max-w-4xl');
  expect(html).toContain('aria-label="Collapse Work"');
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain('Last 7 days');
  expect(html.match(/title="[^"]*of \d+ done"/g)).toHaveLength(7);
  expect(html).toContain('Next planned day');
  expect(html).toContain('1 task');
  expect(html).toContain('Open</button>');
});
