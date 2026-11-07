import type { InkPage, InkStroke } from '../types/daymark';
import { addStroke, decodePoints, encodePoints, eraseStrokes, PAGE_WIDTH } from './inkModel';

export const TEXT_BOX_MAX = 5000; // characters
export const TEXT_SIZE = 20; // page units, the size of a box without fontSize
export const TEXT_SIZE_MIN = 8;
export const TEXT_SIZE_MAX = 160;
export const TEXT_WIDTH_MIN = 40; // page units
export const TEXT_LINE_HEIGHT = 1.25; // times the text size
const CHAR_WIDTH = 0.55; // average glyph width, times the text size, for estimated bounds

export type TextBoxSize = { fontSize?: number; boxWidth?: number };

export function isTextBox(s: InkStroke): boolean {
  return s.text !== undefined;
}

export function textBoxAnchor(s: InkStroke): { x: number; y: number } {
  const { x, y } = decodePoints(s.points)[0];
  return { x, y };
}

export function createTextBox(text: string, at: { x: number; y: number }, color: string, id: string, now: string, size: TextBoxSize = {}): InkStroke {
  const box: InkStroke = { id, tool: 'pen', width: 1, points: encodePoints([{ ...at, p: 0.5 }]), color, text, createdAt: now };
  if (size.fontSize !== undefined) box.fontSize = size.fontSize;
  if (size.boxWidth !== undefined) box.boxWidth = size.boxWidth;
  return box;
}

export function clampTextSize(size: number): number {
  return Math.max(TEXT_SIZE_MIN, Math.min(TEXT_SIZE_MAX, size));
}

export function clampBoxWidth(width: number, x: number): number {
  return Math.max(TEXT_WIDTH_MIN, Math.min(PAGE_WIDTH - x, width));
}

/** Estimated page-unit bounds of a text box, used for selecting, moving and resizing it. */
export function textBoxBounds(s: InkStroke): { minX: number; minY: number; maxX: number; maxY: number } {
  const { x, y } = textBoxAnchor(s);
  const fontSize = s.fontSize ?? TEXT_SIZE;
  const lines = (s.text ?? '').split('\n').map(line => line.length * CHAR_WIDTH * fontSize);
  const width = s.boxWidth ?? Math.min(PAGE_WIDTH - x, Math.max(...lines));
  const rows = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line / Math.max(1, width))), 0);
  return { minX: x, minY: y, maxX: x + width, maxY: y + rows * fontSize * TEXT_LINE_HEIGHT };
}

export function replaceTextBox(page: InkPage, id: string, next: { text?: string; at?: { x: number; y: number }; color?: string } & TextBoxSize, newId: string, now: string): InkPage {
  const old = visibleTextBoxes(page).find(s => s.id === id);
  if (!old) return page;
  const text = next.text ?? old.text!;
  const removed = eraseStrokes(page, [id], now);
  if (text === '') return removed;
  return addStroke(removed, createTextBox(text, next.at ?? textBoxAnchor(old), next.color ?? old.color, newId, old.createdAt,
    { fontSize: next.fontSize ?? old.fontSize, boxWidth: next.boxWidth ?? old.boxWidth }), now);
}

export function visibleTextBoxes(page: InkPage): InkStroke[] {
  const removed = new Set(page.removed);
  return page.strokes.filter(s => isTextBox(s) && !removed.has(s.id));
}
