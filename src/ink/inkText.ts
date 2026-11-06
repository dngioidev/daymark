import type { InkPage, InkStroke } from '../types/daymark';
import { addStroke, decodePoints, encodePoints, eraseStrokes } from './inkModel';

export const TEXT_BOX_MAX = 5000; // characters

export function isTextBox(s: InkStroke): boolean {
  return s.text !== undefined;
}

export function textBoxAnchor(s: InkStroke): { x: number; y: number } {
  const { x, y } = decodePoints(s.points)[0];
  return { x, y };
}

export function createTextBox(text: string, at: { x: number; y: number }, color: string, id: string, now: string): InkStroke {
  return { id, tool: 'pen', width: 1, points: encodePoints([{ ...at, p: 0.5 }]), color, text, createdAt: now };
}

export function replaceTextBox(page: InkPage, id: string, next: { text?: string; at?: { x: number; y: number }; color?: string }, newId: string, now: string): InkPage {
  const old = visibleTextBoxes(page).find(s => s.id === id);
  if (!old) return page;
  const text = next.text ?? old.text!;
  const removed = eraseStrokes(page, [id], now);
  if (text === '') return removed;
  return addStroke(removed, createTextBox(text, next.at ?? textBoxAnchor(old), next.color ?? old.color, newId, old.createdAt), now);
}

export function visibleTextBoxes(page: InkPage): InkStroke[] {
  const removed = new Set(page.removed);
  return page.strokes.filter(s => isTextBox(s) && !removed.has(s.id));
}
