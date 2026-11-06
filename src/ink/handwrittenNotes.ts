import type { StandaloneNote } from '../types/daymark';

export const HANDWRITTEN_PLACEHOLDER = 'Handwritten note: open Daymark 1.11 or later on a tablet to view.';

export function createHandwrittenNote(folder: string, paper: NonNullable<StandaloneNote['paper']>, now: string): StandaloneNote {
  return { id: `note-${crypto.randomUUID()}`, title: 'Untitled', folder, kind: 'handwritten', paper,
    content: HANDWRITTEN_PLACEHOLDER, tags: [], pinned: false, createdAt: now, updatedAt: now };
}

/** Pen capability remembered on this device; text and mouse tools do not require it. */
export function canWrite(): boolean {
  try { return localStorage.getItem('dm.ink.penSeen') === '1'; } catch { return false; }
}

export function rememberPen(): void {
  try {
    if (!canWrite()) localStorage.setItem('dm.ink.penSeen', '1');
  } catch { /* Writing still works for this session. */ }
}

export function pageCountLabel(count: number): string {
  const pages = Math.max(1, count);
  return `${pages} ${pages === 1 ? 'page' : 'pages'}`;
}
