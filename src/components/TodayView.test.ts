import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { TodayView } from './TodayView';
import { DEFAULT_SETTINGS } from '../utils/defaultData';
import type { DailyDocument } from '../types/daymark';

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
