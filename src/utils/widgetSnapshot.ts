import { DailyDocument } from '../types/daymark';

/** Compact view of today's tasks handed to the native Android home-screen widget. */
export interface WidgetTask {
  id: string;
  title: string;
  status: string;
  createdDate: string;
  carriedFromDate?: string;
  section?: string;
}

export interface WidgetSnapshot {
  date: string;
  tasks: WidgetTask[];
  updatedAt: string;
}

const MAX_WIDGET_TASKS = 30;

/**
 * Builds the snapshot for `today` from the web app's source of truth.
 * Archived tasks are omitted; done tasks are kept so the widget can show "x/y done".
 * Active tasks come first, in note order, then done ones.
 */
export function buildWidgetSnapshot(doc: DailyDocument | undefined, today: string): WidgetSnapshot {
  const all = (doc?.headings ?? [])
    .flatMap((h) => h.items.map((t) => ({ ...t, section: h.name })))
    .filter((t) => t.status !== 'archived')
    .map<WidgetTask>((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      createdDate: t.createdDate,
      carriedFromDate: t.carriedFromDate,
      section: t.section,
    }));
  const active = all.filter((t) => t.status !== 'done');
  const done = all.filter((t) => t.status === 'done');
  return {
    date: today,
    tasks: [...active, ...done].slice(0, MAX_WIDGET_TASKS),
    updatedAt: new Date().toISOString(),
  };
}
