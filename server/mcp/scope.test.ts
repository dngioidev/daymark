import { expect, it } from 'vitest';
import { NO_GRANTS } from '../../src/sync/mcpProtocol';
import type { McpGrants } from '../../src/sync/mcpProtocol';
import type { BacklogData, DailyDocument, HabitData, StandaloneNote } from '../../src/types/daymark';
import {
  NOT_SHARED, ScopeError, assertWrite, folderGranted, headingGranted,
  normalizeHeading, scopeBacklog, scopeDoc, scopeHabits, scopeNotes,
} from './scope';
import type { WriteTarget } from './scope';

const noGrants = (): McpGrants => ({ ...NO_GRANTS, headings: [...NO_GRANTS.headings], folders: [...NO_GRANTS.folders] });
const docWith = (names: string[]): DailyDocument => ({
  date: '2026-11-12', type: 'daily', updatedAt: '2026-11-12T00:00:00Z',
  headings: names.map(name => ({ name, items: [], notesContent: `${name} notes` })),
});
const noteIn = (folder: string): StandaloneNote => ({
  id: folder || 'root', title: 'Note', folder, content: 'Note content', tags: [],
  createdAt: '2026-11-12T00:00:00Z', updatedAt: '2026-11-12T00:00:00Z',
});

it('matches normalized heading names, not prefixes or renamed headings', () => {
  const g = { ...NO_GRANTS, headings: ['Work'], folders: ['Work'] };
  expect(normalizeHeading(' WoRK ')).toBe('work');
  expect(headingGranted(g, ' work ')).toBe(true);
  expect(headingGranted(g, 'Workshop')).toBe(false);
  expect(headingGranted(g, 'Job')).toBe(false);
  expect(headingGranted({ ...noGrants(), headings: [' WORK '] }, 'Work')).toBe(true);
  expect(headingGranted(noGrants(), 'Work')).toBe(false);
});

it('matches exact folder paths and descendants at slash boundaries', () => {
  const g = { ...NO_GRANTS, headings: ['Work'], folders: ['Work'] };
  expect(folderGranted(g, 'Work')).toBe(true);
  expect(folderGranted(g, 'Work/ClientA')).toBe(true);
  expect(folderGranted(g, 'Work/ClientA/Notes')).toBe(true);
  expect(folderGranted(g, 'Workshop')).toBe(false);
  expect(folderGranted(g, 'Personal')).toBe(false);
  expect(folderGranted(g, 'work')).toBe(false);
  expect(folderGranted(g, ' Work ')).toBe(false);
  expect(folderGranted(g, '')).toBe(false);
  const nested = { ...noGrants(), folders: ['Work/ClientA'] };
  expect(folderGranted(nested, 'Work')).toBe(false);
  expect(folderGranted(nested, 'Work/ClientAB')).toBe(false);
});

it('grants root only explicitly and does not treat root as all folders', () => {
  const g = { ...noGrants(), folders: [''] };
  expect(folderGranted(g, '')).toBe(true);
  expect(folderGranted(g, 'Work')).toBe(false);
});

it('keeps granted headings in order and returns null when none remain', () => {
  const g = { ...NO_GRANTS, headings: ['Work'], folders: ['Work'] };
  expect(scopeDoc(docWith(['Work', 'Personal']), g)!.headings.map(h => h.name)).toEqual(['Work']);
  expect(scopeDoc(docWith(['Personal']), g)).toBeNull();
  const doc = docWith(['Personal', ' work ', 'Work']);
  const before = structuredClone(doc);
  expect(scopeDoc(doc, g)).toEqual({ ...doc, headings: [doc.headings[1], doc.headings[2]] });
  expect(doc).toEqual(before);
  expect(scopeDoc(docWith([]), g)).toBeNull();
});

it('does not expose unfiltered markdown through a scoped document', () => {
  const doc = { ...docWith(['Work', 'Personal']), rawMarkdown: '## Personal\nPrivate notes' };
  const scoped = scopeDoc(doc, { ...noGrants(), headings: ['Work'] });
  expect(scoped!.rawMarkdown).toBeUndefined();
  expect(doc.rawMarkdown).toBe('## Personal\nPrivate notes');
});

it('filters notes by folder without modifying input notes or grants', () => {
  const g = { ...noGrants(), folders: ['Work'] };
  const notes = ['Personal', 'Work/ClientA', '', 'Workshop', 'Work'].map(noteIn);
  const before = structuredClone({ notes, g });
  expect(scopeNotes(notes, g)).toEqual([notes[1], notes[4]]);
  expect(scopeNotes(notes, noGrants())).toEqual([]);
  expect({ notes, g }).toEqual(before);
});

const backlog: BacklogData = { items: [
  { id: 'a', title: 'First', category: 'Work', order: 0, createdAt: '2026-11-12', updatedAt: '2026-11-12' },
  { id: 'b', title: 'Second', category: 'Personal', order: 1, createdAt: '2026-11-12', updatedAt: '2026-11-12' },
] };
const habits: HabitData = {
  habits: [{ id: 'h', name: 'Walk', order: 0, warnAfterDays: 2, addedOn: '2026-11-12', updatedAt: '2026-11-12' }],
  days: [{ date: '2026-11-12', ticks: { h: { done: true, at: '2026-11-12T00:00:00Z' } } }],
};

it('scopes backlog as a whole and habits independently', () => {
  expect(scopeBacklog(backlog, noGrants())).toBeNull();
  expect(scopeHabits(habits, noGrants())).toBeNull();
  const g = { ...noGrants(), backlog: true };
  expect(scopeBacklog(backlog, g)).toEqual(backlog);
  expect(scopeHabits(habits, g)).toBeNull();
  const h = { ...noGrants(), habits: true };
  expect(scopeHabits(habits, h)).toEqual(habits);
  expect(scopeBacklog(backlog, h)).toBeNull();
});

const targets: WriteTarget[] = [
  { kind: 'heading', name: ' work ' }, { kind: 'folder', folder: 'Work/ClientA' },
  { kind: 'backlog' }, { kind: 'habits' },
];

it('all grants include newly created headings and folders and both other areas', () => {
  const g = { ...noGrants(), all: true };
  expect(headingGranted(g, 'Future heading')).toBe(true);
  expect(folderGranted(g, 'Future/Folder')).toBe(true);
  expect(folderGranted(g, '')).toBe(true);
  const doc = docWith(['Future heading']);
  expect(scopeDoc(doc, g)).toEqual(doc);
  expect(scopeDoc(docWith([]), g)).toBeNull();
  expect(scopeNotes([noteIn('Future/Folder'), noteIn('')], g)).toHaveLength(2);
  expect(scopeBacklog(backlog, g)).toEqual(backlog);
  expect(scopeHabits(habits, g)).toEqual(habits);
  for (const target of [...targets, { kind: 'heading', name: 'Future heading' } as const]) {
    expect(() => assertWrite({ access: 'full', grants: g }, target)).not.toThrow();
    expect(() => assertWrite({ access: 'read-only', grants: g }, target)).toThrow(ScopeError);
  }
});

it('uses the same scope error for read-only access and ungranted targets', () => {
  const g = { ...NO_GRANTS, headings: ['Work'], folders: ['Work'] };
  expect(() => assertWrite({ access: 'read-only', grants: g }, { kind: 'heading', name: 'Work' })).toThrow(NOT_SHARED);
  expect(() => assertWrite({ access: 'read-only', grants: g }, { kind: 'backlog' }, { feedback: true })).not.toThrow();
  expect(() => assertWrite({ access: 'full', grants: g }, { kind: 'heading', name: 'Personal' })).toThrow(NOT_SHARED);
  expect(new ScopeError().message).toBe(NOT_SHARED);
  expect(new ScopeError('Custom refusal').message).toBe('Custom refusal');
});

it.each(targets)('requires full access and the corresponding grant for $kind writes', target => {
  const g = { ...noGrants(), headings: ['Work'], folders: ['Work'], backlog: true, habits: true };
  expect(() => assertWrite({ access: 'full', grants: g }, target)).not.toThrow();
  expect(() => assertWrite({ access: 'read-only', grants: g }, target)).toThrow(NOT_SHARED);
  expect(() => assertWrite({ access: 'full', grants: noGrants() }, target)).toThrow(ScopeError);
  expect(() => assertWrite({ access: 'full', grants: noGrants() }, target, { feedback: false })).toThrow(NOT_SHARED);
  expect(() => assertWrite({ access: 'read-only', grants: noGrants() }, target, { feedback: true })).not.toThrow();
});
