import { formatLongDate } from './dateFormat';
import { notePreview } from './notes';

export const NOTE_TEMPLATES: {
  id: 'blank' | 'meeting' | 'daily-review' | 'adr';
  label: string;
  folder: string | null;
  title: (today: string) => string;
  body: (today: string) => string;
}[] = [
  { id: 'blank', label: 'Blank', folder: null, title: () => 'Untitled', body: () => '' },
  {
    id: 'meeting', label: 'Meeting', folder: 'Meetings',
    title: (today) => `Meeting · ${formatLongDate(today)}`,
    body: (today) => `Date: ${formatLongDate(today)}\n\n## Attendees\n\n- \n\n## Agenda\n\n- \n\n## Notes\n\n\n## Action items\n\n- [ ] \n`,
  },
  {
    id: 'daily-review', label: 'Daily review', folder: 'Personal',
    title: (today) => `Daily review · ${formatLongDate(today)}`,
    body: (today) => `Date: ${formatLongDate(today)}\n\n## What went well\n\n\n## What I learned\n\n\n## Tomorrow\n\n- [ ] \n`,
  },
  {
    id: 'adr', label: 'Decision record', folder: 'Technical',
    title: () => 'Decision record',
    body: (today) => `Date: ${formatLongDate(today)}\n\n## Context\n\n\n## Decision\n\n\n## Consequences\n\n`,
  },
];

/** Count visible words, including code, without Markdown punctuation or metadata. */
export function wordCount(markdown: string): number {
  const text = notePreview(markdown.replace(/^\s*(```|~~~).*$/gm, ''), Number.MAX_SAFE_INTEGER);
  return text.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
