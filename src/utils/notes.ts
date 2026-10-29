import { StandaloneNote } from '../types/daymark';
import { formatLocalDate } from './clock';
import { formatDay } from './dateFormat';

/** Plain-text preview of a Markdown note: no heading marks, checkboxes, emphasis or link syntax. */
export function notePreview(content: string, maxLength = 160): string {
  const text = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?(\[!\w+\]\s*)?/gm, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_|~~|`)(.+?)\1/g, '$2')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** Pinned notes first, then most recently edited. */
export function sortNotes(notes: StandaloneNote[]): StandaloneNote[] {
  return [...notes].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt));
}

/** "Today", "Yesterday" or "Fri 16 Oct" for a note's last edit. */
export function formatNoteDate(iso: string, today: string = formatLocalDate()): string {
  return formatDay(formatLocalDate(new Date(iso)), today);
}
