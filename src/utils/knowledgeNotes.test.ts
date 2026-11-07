import { describe, expect, it } from 'vitest';
import type { InkPage, StandaloneNote } from '../types/daymark';
import { createTextBox } from '../ink/inkText';
import { effectiveTags, handwrittenText, knowledgeNotes } from './knowledgeNotes';

const at = '2026-11-07T00:00:00.000Z';
const note = (id: string, patch: Partial<StandaloneNote> = {}): StandaloneNote => ({
  id, title: id, folder: '', content: '', tags: [], createdAt: at, updatedAt: at, ...patch,
});
const page = (noteId: string, n: number, boxes: [string, number, number][], removed: string[] = []): InkPage => ({
  noteId, page: n, removed, updatedAt: at,
  strokes: boxes.map(([text, x, y], i) => createTextBox(text, { x, y }, '#292524', `${noteId}-${n}-${i}`, at)),
});

describe('knowledge notes', () => {
  it('merges stored tags with tags in the text, stored spelling first', () => {
    expect(effectiveTags(note('a', { tags: ['Java'], content: '#java #sql' }))).toEqual(['Java', 'sql']);
    const [known] = knowledgeNotes([note('a', { tags: ['Java'], content: '#java #sql' })], () => []);
    expect(known.tags).toEqual(['Java', 'sql']);
  });

  it('gives a handwritten note its text-box text, in page then reading order, and its tags', () => {
    const ink = note('ink', { kind: 'handwritten', content: 'placeholder', tags: ['plan'] });
    const pages = [page('ink', 1, [['two', 10, 10]]), page('ink', 0, [['later', 10, 500], ['#ideas one', 10, 20]])];
    expect(handwrittenText(pages)).toBe('#ideas one\n\nlater\n\ntwo');
    const [known] = knowledgeNotes([ink], () => pages);
    expect(known.content).toBe('#ideas one\n\nlater\n\ntwo');
    expect(known.tags).toEqual(['plan', 'ideas']);
  });

  it('ignores removed text boxes', () => {
    const pages = [page('ink', 0, [['kept', 0, 0], ['gone', 0, 50]], ['ink-0-1'])];
    expect(handwrittenText(pages)).toBe('kept');
  });

  it('returns the same objects for unchanged inputs and never mutates the notes', () => {
    const notes = [note('a', { content: '#x' }), note('ink', { kind: 'handwritten' })];
    const pages = [page('ink', 0, [['#y', 0, 0]])];
    const before = structuredClone(notes);
    const first = knowledgeNotes(notes, () => pages);
    const second = knowledgeNotes(notes, () => pages);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    expect(notes).toEqual(before);
    expect(first[1]).not.toBe(notes[1]);
  });

  it('rebuilds a handwritten note when its pages change', () => {
    const notes = [note('ink', { kind: 'handwritten' })];
    const first = knowledgeNotes(notes, () => [page('ink', 0, [['#old', 0, 0]])]);
    const second = knowledgeNotes(notes, () => [page('ink', 0, [['#new', 0, 0]])]);
    expect(first[0].tags).toEqual(['old']);
    expect(second[0].tags).toEqual(['new']);
  });
});
