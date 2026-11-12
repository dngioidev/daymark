import { beforeEach, expect, it } from 'vitest';
import type { DailyDocument, StandaloneNote } from '../../src/types/daymark';
import { DEFAULT_SETTINGS } from '../../src/utils/defaultData';
import { EMPTY_BACKLOG } from '../../src/utils/backlog';
import { EMPTY_HABITS } from '../../src/utils/habits';
import { performDailyRollover } from '../../src/utils/lifecycleEngine';
import { parseDailyDocument, serializeDailyDocument } from '../../src/utils/markdownEngine';
import { FileStore } from '../store';
import { dayView, ensureDay, knownFolders, knownHeadings, readBacklog, readDocs, readHabits, readNotes, readSettings, todayIn } from './vaultView';

let store: FileStore;
const statuses = DEFAULT_SETTINGS.statuses;
const docOn = (date: string, name = 'Work'): DailyDocument => ({
  date, type: 'daily', updatedAt: `${date}T00:00:00Z`, rawMarkdown: 'stale markdown',
  headings: [{ name, notesContent: 'Journal', items: [] }],
});
function put(key: string, value: unknown) {
  store.vault.entities[key] = { rev: 1, value, updatedBy: 'test', updatedAt: '2026-11-12T00:00:00Z' };
}
beforeEach(() => {
  store = new FileStore('unused');
  const yesterday = docOn('2026-11-11');
  yesterday.headings[0].items.push({
    id: 't1', title: 'Open task', status: 'in-progress', createdDate: '2026-11-11',
    originalNoteDate: '2026-11-11', heading: 'Work', order: 1, historyLog: [],
  });
  put('doc:2026-11-11', yesterday);
});

it('todayIn uses the configured zone across midnight', () => {
  const t = new Date('2026-11-12T17:30:00Z');
  expect(todayIn('Asia/Ho_Chi_Minh', t)).toBe('2026-11-13');
  expect(todayIn('UTC', t)).toBe('2026-11-12');
});

it('dayView for today carries yesterday\'s open task without saving', () => {
  const before = structuredClone(store.vault);
  const v = dayView(store, '2026-11-12', '2026-11-12');
  expect(v.headings.flatMap(h => h.items).map(t => t.id)).toContain('t1');
  expect(store.vault.entities['doc:2026-11-12']).toBeUndefined();
  expect(store.vault).toEqual(before);
});

it('ensureDay then client rollover gives no duplicate', () => {
  const { doc, created } = ensureDay(store, '2026-11-12', '2026-11-12');
  expect(created).toBe(true);
  const again = performDailyRollover('2026-11-12', [...readDocs(store).filter(d => d.date !== doc.date), doc], statuses).updatedDocs;
  const today = again.find(d => d.date === '2026-11-12')!;
  expect(today.headings.flatMap(h => h.items).filter(t => t.id === 't1')).toHaveLength(1);
  put('doc:2026-11-12', doc);
  expect(ensureDay(store, doc.date, doc.date).created).toBe(false);
});

it('a server-created today round-trips through serializeDailyDocument/parseDailyDocument keeping task comments', () => {
  const { doc } = ensureDay(store, '2026-11-12', '2026-11-12');
  expect(doc).not.toHaveProperty('rawMarkdown');
  const markdown = serializeDailyDocument(doc);
  expect(markdown).toContain('<!-- daymark: task_id=t1 status=in-progress created=2026-11-11 carried_from=2026-11-11 -->');
  expect(parseDailyDocument(markdown, doc.date).headings.flatMap(h => h.items)).toEqual([
    expect.objectContaining({ id: 't1', status: 'in-progress', carriedFromDate: '2026-11-11' }),
  ]);
});

it('rolls over into an existing today and returns detached documents without rawMarkdown', () => {
  put('doc:2026-11-12', docOn('2026-11-12'));
  const { doc, created } = ensureDay(store, '2026-11-12', '2026-11-12');
  expect(created).toBe(false);
  expect(doc.headings.flatMap(h => h.items).map(t => t.id)).toEqual(['t1']);
  expect(doc).not.toHaveProperty('rawMarkdown');
  doc.headings[0].notesContent = 'changed';
  expect(readDocs(store).find(d => d.date === doc.date)?.headings[0].notesContent).toBe('Journal');
});

it('uses stored historical days and creates empty other days with configured headings', () => {
  put('settings', { ...DEFAULT_SETTINGS, defaultHeadings: ['Custom'] });
  expect(dayView(store, '2026-11-11', '2026-11-12').headings[0].items).toHaveLength(1);
  for (const date of ['2026-11-10', '2026-11-13']) {
    const result = ensureDay(store, date, '2026-11-12');
    expect(result.created).toBe(true);
    expect(result.doc.headings).toEqual([{ name: 'Custom', items: [], notesContent: '' }]);
    expect(result.doc).not.toHaveProperty('rawMarkdown');
  }
});

it('reads only valid live documents and notes, sorted by document date', () => {
  put('doc:2026-11-10', docOn('2026-11-10'));
  put('doc:2026-11-09', docOn('2026-11-08'));
  put('doc:2026-11-08', null);
  put('doc:2026-11-07', { headings: [] });
  const note: StandaloneNote = { id: 'n1', title: 'Note', folder: '', content: '', tags: [], createdAt: '', updatedAt: '' };
  put('note:n1', note);
  put('note:wrong', note);
  put('note:deleted', null);
  put('note:invalid', {});
  expect(readDocs(store).map(d => d.date)).toEqual(['2026-11-10', '2026-11-11']);
  expect(readNotes(store).map(n => n.id)).toEqual(['n1']);
  readNotes(store)[0].title = 'Changed';
  expect(note.title).toBe('Note');
});

it('reads backlog and split habit entities, skipping invalid and deleted values', () => {
  expect(readBacklog(store)).toEqual(EMPTY_BACKLOG);
  expect(readBacklog(store)).not.toBe(EMPTY_BACKLOG);
  expect(readHabits(store)).toEqual(EMPTY_HABITS);
  expect(readHabits(store).habits).not.toBe(EMPTY_HABITS.habits);
  put('backlog', { items: [] });
  put('habits', { habits: [{ id: 'h1', name: 'Walk', order: 1, warnAfterDays: 3, addedOn: '2026-11-01', updatedAt: '' }] });
  put('habitday:2026-11-12', { date: '2026-11-12', ticks: { h1: { done: true, at: '' } } });
  put('habitday:2026-11-11', { date: '2026-11-11', ticks: {} });
  put('habitday:2026-11-10', { date: '2026-11-09', ticks: {} });
  put('habitday:2026-11-09', null);
  put('habitday:2026-11-08', {});
  const data = readHabits(store);
  expect(data.habits.map(h => h.id)).toEqual(['h1']);
  expect(data.days.map(d => d.date)).toEqual(['2026-11-11', '2026-11-12']);
  data.habits[0].name = 'Changed';
  expect(readHabits(store).habits[0].name).toBe('Walk');
  put('backlog', {});
  put('habits', {});
  expect(readBacklog(store)).toEqual({ items: [] });
  expect(readHabits(store).habits).toEqual([]);
  expect(readHabits(store).days).toHaveLength(2);
});

it('defaults missing settings fields and returns detached settings', () => {
  expect(readSettings(store).agingThresholds).toEqual(DEFAULT_SETTINGS.agingThresholds);
  put('settings', { statuses, defaultHeadings: ['Custom'] });
  const settings = readSettings(store);
  expect(settings.defaultHeadings).toEqual(['Custom']);
  expect(settings.agingThresholds).toEqual(DEFAULT_SETTINGS.agingThresholds);
  settings.statuses[0].label = 'Changed';
  settings.agingThresholds.statuses.push('custom');
  expect(DEFAULT_SETTINGS.statuses[0].label).toBe('Note');
  expect(DEFAULT_SETTINGS.agingThresholds.statuses).not.toContain('custom');
  put('settings', null);
  expect(readSettings(store).defaultHeadings).toEqual(DEFAULT_SETTINGS.defaultHeadings);
});

it('discovers headings in the last 30 calendar days, ignoring future days and case duplicates', () => {
  put('settings', { statuses, defaultHeadings: ['Work'] });
  put('doc:2026-10-14', docOn('2026-10-14', 'Boundary'));
  put('doc:2026-10-13', docOn('2026-10-13', 'Too old'));
  put('doc:2026-11-12', docOn('2026-11-12', 'work'));
  put('doc:2026-11-13', docOn('2026-11-13', 'Future'));
  expect(knownHeadings(store, '2026-11-12')).toEqual(['Work', 'Boundary']);
});

it('discovers note and live metadata folders with every parent path', () => {
  put('note:n1', { id: 'n1', title: '', content: '', folder: 'Work/Client/Notes', tags: [] });
  put('note:n2', { id: 'n2', title: '', content: '', folder: '', tags: [] });
  put('notemeta', { folders: [
    { path: 'Personal/Ideas', updatedAt: '' }, { path: 'Removed', updatedAt: '', removed: true },
    { path: 'Work/Client', updatedAt: '' },
  ], dismissed: [] });
  expect(knownFolders(store).sort()).toEqual(['', 'Personal', 'Personal/Ideas', 'Work', 'Work/Client', 'Work/Client/Notes']);
  put('notemeta', {});
  expect(knownFolders(store)).not.toContain('Personal');
});
