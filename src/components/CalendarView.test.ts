import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { CalendarView } from './CalendarView';
import { DEFAULT_SETTINGS } from '../utils/defaultData';
import type { DailyDocument } from '../types/daymark';

// DOMPurify needs a browser DOM; this test checks the surrounding Calendar rendering.
vi.mock('dompurify', () => ({ default: { sanitize: (html: string) => html } }));

it('renders enabled future cells, counts, notes, Planned and the existing panels', () => {
  const doc: DailyDocument = {
    date: '2026-10-25', type: 'daily', updatedAt: '',
    headings: [{ name: 'Work', notesContent: 'Plan next week', items: [{
      id: 'plan', title: 'Prepare', status: 'in-progress', createdDate: '2026-10-21',
      originalNoteDate: '2026-10-25', heading: 'Work', order: 0, historyLog: [],
    }] }],
  };
  const html = renderToStaticMarkup(React.createElement(CalendarView, {
    dailyDocuments: [doc], selectedDate: doc.date, simulatedToday: '2026-10-21',
    statuses: DEFAULT_SETTINGS.statuses, onSelectDate: vi.fn(), onReopenTask: vi.fn(),
    onMarkDoneOnDay: vi.fn(), onOpenDay: vi.fn(), onMoveTask: vi.fn(),
  }));
  expect(html).toContain('>Calendar</h1>');
  expect(html).toContain('max-w-[1800px]');
  expect(html.match(/dm-card/g)).toHaveLength(2);
  expect(html).toContain('>Month</button>');
  expect(html).toContain('>Week</button>');
  expect(html).toContain('>0/1</span>');
  expect(html).toContain('aria-label="has notes"');
  expect(html).toContain('Planned');
  expect(html).toContain('Prepare');
  expect(html).toContain('Plan next week');
  expect(html).toContain('Open this day');
  expect(html).toContain('Last 7 days:');
  expect(html).not.toContain('disabled=""');
  expect(html).not.toContain('Recent days');
  expect(html).not.toContain('Done this day');
});
