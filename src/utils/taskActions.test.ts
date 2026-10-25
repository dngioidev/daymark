import { afterEach, describe, expect, it, vi } from 'vitest';
import { DailyDocument, TaskItem } from '../types/daymark';
import { DEFAULT_SETTINGS } from './defaultData';
import { isClosedCopy } from './taskActions';
import { performDailyRollover } from './lifecycleEngine';
import { isDailyDocument } from './vaultValidation';
import { applyMarkdownEdit, closeEarlierCopies, followDoneChanges, isDoneLater, reopenEarlierCopies, getMoveTaskDateError, getMoveToTomorrowDate, moveTaskToDate, undoMoveTask, removeTaskFromDocument, replaceTaskInDocument, restoreTaskToDocument, toggleTaskDoneInDocument } from './taskActions';

const task = (id: string, title = id): TaskItem => ({
  id,
  title,
  status: 'in-progress',
  createdDate: '2026-10-21',
  originalNoteDate: '2026-10-21',
  heading: 'Work',
  order: 1,
  historyLog: [],
});

const doc = (items: TaskItem[]): DailyDocument => ({
  date: '2026-10-21',
  type: 'daily',
  updatedAt: '2026-10-21T08:00:00Z',
  headings: [{ name: 'Work', items, notesContent: '' }],
});

const titles = (d: DailyDocument) => d.headings.flatMap((h) => h.items.map((t) => t.title));

it('recognises backlog closures and clears their mark when explicitly reopened', () => {
  const closed = { ...task('a'), status: 'done', movedToBacklogDate: '2026-10-23' };
  expect(isClosedCopy(closed)).toBe(true);
  expect(isClosedCopy({ ...task('a'), movedToBacklogDate: '2026-10-23' })).toBe(true);
  expect(isClosedCopy({ ...task('a'), status: 'done', doneLaterDate: '2026-10-23' })).toBe(true);
  expect(isClosedCopy(task('a'))).toBe(false);
  const reopened = doc([{ ...closed, status: 'in-progress' }]);
  expect(followDoneChanges([reopened], doc([closed]), reopened)[0].headings[0].items[0].movedToBacklogDate).toBeUndefined();
});

describe('move to tomorrow menu destination', () => {
  it('hides the action when viewing tomorrow’s planned day', () => {
    expect(getMoveToTomorrowDate('in-progress', '2026-10-23', '2026-10-22')).toBeNull();
  });

  it('hides the action for done tasks', () => {
    expect(getMoveToTomorrowDate('done', '2026-10-22', '2026-10-22')).toBeNull();
  });

  it('uses tomorrow relative to today when viewing today, a past day or another future day', () => {
    for (const fromDate of ['2026-10-21', '2026-10-22', '2026-10-25']) {
      expect(getMoveToTomorrowDate('in-progress', fromDate, '2026-10-22')).toBe('2026-10-23');
    }
  });

  it('handles tomorrow across a month boundary', () => {
    expect(getMoveToTomorrowDate('waiting', '2026-10-31', '2026-10-31')).toBe('2026-11-01');
    expect(getMoveToTomorrowDate('waiting', '2026-11-01', '2026-10-31')).toBeNull();
  });
});

describe('move date validation', () => {
  it('rejects an empty date, past dates and the source day, allowing today as a Calendar destination', () => {
    expect(getMoveTaskDateError('', '2026-10-25', '2026-10-22')).toBe('Choose a date.');
    expect(getMoveTaskDateError('2026-10-21', '2026-10-25', '2026-10-22')).toBe('Choose today or a later day.');
    expect(getMoveTaskDateError('2026-10-22', '2026-10-25', '2026-10-22')).toBeNull();
    expect(getMoveTaskDateError('2026-10-25', '2026-10-25', '2026-10-22')).toBe('Choose a different day from the source day.');
    expect(getMoveTaskDateError('2026-10-23', '2026-10-25', '2026-10-22')).toBeNull();
  });
});

describe('toggleTaskDoneInDocument', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('works where crypto.randomUUID is missing (app opened over plain HTTP on a LAN address)', () => {
    vi.stubGlobal('crypto', {});
    const original = doc([task('a')]);
    const done = toggleTaskDoneInDocument(original, 'a', original.date)!;
    const reopened = toggleTaskDoneInDocument(done.doc, 'a', original.date)!;
    expect(done.task.status).toBe('done');
    expect(new Set(reopened.task.historyLog.map((h) => h.id)).size).toBe(2);
  });

  it('toggles an accepted legacy task that has no history', () => {
    const legacy: unknown = { date: '2026-10-21', headings: [{ name: 'Work', items: [
      { id: 'a', title: 'Legacy task', status: 'blocked', createdDate: '2026-10-21' },
    ] }] };
    expect(isDailyDocument(legacy)).toBe(true);
    if (!isDailyDocument(legacy)) throw new Error('Invalid fixture');
    const done = toggleTaskDoneInDocument(legacy, 'a', legacy.date)!;
    expect(done.task.status).toBe('done');
    expect(done.task.historyLog.map((h) => h.action)).toEqual(['status_changed']);
  });
  it.each(['blocked', 'waiting', 'not-started'])('unticking returns a %s task to its previous status', (status) => {
    const original = doc([{ ...task('a'), status }]);
    const done = toggleTaskDoneInDocument(original, 'a', original.date)!;
    expect(done.task.status).toBe('done');
    expect(done.task.completedDate).toBe(original.date);
    const reopened = toggleTaskDoneInDocument(done.doc, 'a', original.date)!;
    expect(reopened.task.status).toBe(status);
    expect(reopened.task.completedDate).toBeUndefined();
    expect(reopened.task).not.toHaveProperty('statusBeforeDone');
    expect(original.headings[0].items[0].status).toBe(status);
  });

  it('falls back to in-progress without a remembered status', () => {
    const original = doc([{ ...task('a'), status: 'done', completedDate: '2026-10-20' }]);
    const reopened = toggleTaskDoneInDocument(original, 'a', original.date)!;
    expect(reopened.task.status).toBe('in-progress');
    expect(reopened.nowDone).toBe(false);
    expect(reopened.task.completedDate).toBeUndefined();
  });

  it('records done and reopened in the history', () => {
    const original = doc([task('a')]);
    const done = toggleTaskDoneInDocument(original, 'a', original.date)!;
    const reopened = toggleTaskDoneInDocument(done.doc, 'a', original.date)!;
    expect(reopened.task.historyLog.map((h) => [h.action, h.details, h.date])).toEqual([
      ['status_changed', 'Marked done', original.date],
      ['reopened', 'Marked not done', original.date],
    ]);
    expect(new Set(reopened.task.historyLog.map((h) => h.id)).size).toBe(2);
  });
});

describe('removeTaskFromDocument / restoreTaskToDocument', () => {
  it('returns null when the task is not in the document', () => {
    expect(removeTaskFromDocument(doc([task('a')]), 'zzz')).toBeNull();
  });

  it('restore puts the task back at its position and clears the tombstone', () => {
    const original = doc([task('a'), task('b'), task('c')]);
    const res = removeTaskFromDocument(original, 'b')!;
    expect(titles(res.doc)).toEqual(['a', 'c']);
    expect(res.doc.removedTaskIds).toEqual(['b']);
    const back = restoreTaskToDocument(res.doc, res.removed);
    expect(titles(back)).toEqual(['a', 'b', 'c']);
    expect(back.removedTaskIds).toBeUndefined();
  });

  it('restore keeps edits made to other tasks after the delete', () => {
    const res = removeTaskFromDocument(doc([task('A'), task('B')]), 'A')!;
    const edited: DailyDocument = {
      ...res.doc,
      headings: res.doc.headings.map((h) => ({ ...h, items: h.items.map((t) => ({ ...t, title: 'B renamed' })) })),
    };
    expect(titles(restoreTaskToDocument(edited, res.removed))).toEqual(['A', 'B renamed']);
  });

  it('restore is a no-op when the task is already back', () => {
    const res = removeTaskFromDocument(doc([task('a'), task('b')]), 'a')!;
    const once = restoreTaskToDocument(res.doc, res.removed);
    const twice = restoreTaskToDocument(once, res.removed);
    expect(titles(twice)).toEqual(['a', 'b']);
  });

  it('restore recreates a missing heading', () => {
    const res = removeTaskFromDocument(doc([task('a')]), 'a')!;
    const noHeading: DailyDocument = { ...res.doc, headings: [] };
    const back = restoreTaskToDocument(noHeading, res.removed);
    expect(back.headings.map((h) => h.name)).toEqual(['Work']);
    expect(titles(back)).toEqual(['a']);
  });
});

describe('applyMarkdownEdit', () => {
  it('keeps existing tombstones and adds ids dropped by the edit, without duplicates', () => {
    const previous: DailyDocument = { ...doc([task('a'), task('b')]), removedTaskIds: ['x', 'a'] };
    const result = applyMarkdownEdit(previous, doc([]));
    expect(result.removedTaskIds?.slice().sort()).toEqual(['a', 'b', 'x']);
  });

  it('keeps tombstones when nothing was dropped', () => {
    const previous: DailyDocument = { ...doc([task('a')]), removedTaskIds: ['x'] };
    expect(applyMarkdownEdit(previous, doc([task('a')])).removedTaskIds).toEqual(['x']);
  });

  it('does not tombstone ids that are still present, and omits an empty list', () => {
    expect(applyMarkdownEdit(doc([task('a')]), doc([task('a')])).removedTaskIds).toBeUndefined();
  });
});

describe('replaceTaskInDocument', () => {
  it('swaps only that task', () => {
    const d = doc([task('a', 'A'), task('b', 'B')]);
    const done = { ...task('b', 'B'), status: 'done' };
    const next = replaceTaskInDocument({ ...d, headings: [{ ...d.headings[0], items: [task('a', 'A renamed'), done] }] }, task('b', 'B'));
    expect(next.headings[0].items.map((t) => `${t.title}:${t.status}`)).toEqual(['A renamed:in-progress', 'B:in-progress']);
  });
});


describe('moveTaskToDate / undoMoveTask', () => {
  const FROM = '2026-10-21';
  const TO = '2026-10-22';
  const NOW = '2026-10-21T12:00:00.000Z';
  const DEFAULT_HEADINGS = DEFAULT_SETTINGS.defaultHeadings;
  const findDoc = (docs: DailyDocument[], date: string) => docs.find((d) => d.date === date)!;
  const items = (docs: DailyDocument[], date: string) => findDoc(docs, date).headings.flatMap((h) => h.items);
  const move = (docs: DailyDocument[], to = TO) => moveTaskToDate(docs, 't1', FROM, to, DEFAULT_HEADINGS, NOW)!;

  it('moves a task to tomorrow: tombstone on source, same id live on target with a history entry', () => {
    const source = doc([{ ...task('t1'), carriedFromDate: '2026-10-20', description: 'Keep notes', checklist: [{ id: 'c1', text: 'Check', done: false }] }]);
    const out = move([source]);
    expect(items(out, FROM)).toEqual([]);
    expect(findDoc(out, FROM).removedTaskIds).toContain('t1');
    expect(items(out, TO)[0]).toMatchObject({ ...source.headings[0].items[0], heading: 'Work', order: 1, historyLog: [{ id: 'hist-move-t1-2026-10-22', timestamp: NOW, action: 'moved', date: FROM, details: 'Moved from 2026-10-21 to 2026-10-22' }] });
    expect(source.headings[0].items).toHaveLength(1);
    expect(source.removedTaskIds).toBeUndefined();
  });

  it('creates the target doc with default headings when it does not exist', () => {
    const target = findDoc(move([doc([task('t1')])], '2026-10-30'), '2026-10-30');
    expect(target.headings.map((h) => h.name)).toEqual(DEFAULT_HEADINGS);
    expect(target.type).toBe('daily');
    expect(target.updatedAt).toBe(NOW);
  });

  it('creates the heading on the target when missing', () => {
    const source = doc([{ ...task('t1'), heading: 'Ideas' }]);
    source.headings[0].name = 'Ideas';
    const target = { ...doc([]), date: TO };
    const out = move([source, target]);
    expect(findDoc(out, TO).headings.map((h) => h.name)).toEqual(['Work', 'Ideas']);
    expect(items(out, TO)[0].heading).toBe('Ideas');
  });

  it('matches headings case-insensitively and appends after planned tasks, clearing a target tombstone', () => {
    const target = { ...doc([task('p1')]), date: TO, removedTaskIds: ['t1', 'other'] };
    target.headings[0].name = 'work';
    const out = move([doc([task('t1')]), target]);
    expect(findDoc(out, TO).headings).toHaveLength(1);
    expect(items(out, TO).map((t) => [t.id, t.order])).toEqual([['p1', 1], ['t1', 2]]);
    expect(items(out, TO)[1].heading).toBe('work');
    expect(findDoc(out, TO).removedTaskIds).toEqual(['other']);
    expect(target.removedTaskIds).toEqual(['t1', 'other']);
  });

  it('moving 5 days ahead leaves no copy on the days between after their rollovers', () => {
    let rolled = move([{ ...doc([task('t1')]), date: '2026-10-20' }, doc([task('t1')])], '2026-10-26');
    for (const d of ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26']) {
      rolled = performDailyRollover(d, rolled, DEFAULT_SETTINGS.statuses).updatedDocs;
      expect(items(rolled, d).map((t) => t.id)).toEqual(d === '2026-10-26' ? ['t1'] : []);
    }
  });

  it('is idempotent on the target: moving again when the target already has the id returns null', () => {
    const docs = [doc([task('t1')]), { ...doc([task('t1')]), date: TO }];
    expect(move(docs)).toBeNull();
    const once = move([doc([task('t1')])]);
    expect(move(once)).toBeNull();
  });

  it('undoMoveTask restores the source exactly and removes the target copy (and an auto-created empty target doc)', () => {
    const source = doc([task('a'), task('t1'), task('b')]);
    const before = { doc: undefined, removed: removeTaskFromDocument(source, 't1')!.removed };
    const out = undoMoveTask(move([source]), 't1', FROM, TO, before, NOW);
    expect(out.map((d) => d.date)).toEqual([FROM]);
    expect(findDoc(out, FROM).headings).toEqual(source.headings);
    expect(findDoc(out, FROM).removedTaskIds).toBeUndefined();
    expect(findDoc(out, FROM).updatedAt).toBe(NOW);
  });

  it('undo keeps an existing target, its original tombstone and later edits on both days', () => {
    const source = doc([task('t1'), task('b')]);
    const target = { ...doc([]), date: TO, removedTaskIds: ['t1'] };
    const moved = move([source, target]).map((d) => ({ ...d, headings: d.headings.map((h) => ({ ...h, notesContent: 'New notes', items: h.items.map((t) => t.id === 'b' ? { ...t, title: 'Renamed' } : t) })) }));
    const out = undoMoveTask(moved, 't1', FROM, TO, { doc: target, removed: removeTaskFromDocument(source, 't1')!.removed }, NOW);
    expect(findDoc(out, FROM).updatedAt).toBe(NOW);
    expect(findDoc(out, TO).updatedAt).toBe(NOW);
    expect(items(out, FROM).map((t) => t.title)).toEqual(['t1', 'Renamed']);
    expect(items(out, TO)).toEqual([]);
    expect(findDoc(out, TO).removedTaskIds).toEqual(['t1']);
    expect(findDoc(out, TO).headings[0].notesContent).toBe('New notes');
  });

  it('undo keeps notes and other tasks added to an auto-created target', () => {
    const source = doc([task('t1')]);
    const moved = move([source]).map((d) => d.date !== TO ? d : { ...d, headings: d.headings.map((h, i) => i ? h : { ...h, notesContent: 'Keep', items: [...h.items, task('new')] }) });
    const out = undoMoveTask(moved, 't1', FROM, TO, { doc: undefined, removed: removeTaskFromDocument(source, 't1')!.removed }, NOW);
    expect(items(out, TO).map((t) => t.id)).toEqual(['new']);
    expect(findDoc(out, TO).headings[0].notesContent).toBe('Keep');
  });

  it('returns null for the same day or when the task is not on the source day', () => {
    expect(move([doc([task('t1')])], FROM)).toBeNull();
    expect(move([doc([task('other')])])).toBeNull();
    expect(move([])).toBeNull();
  });
});

describe('closing earlier carried copies', () => {
  const carried = (date: string, status = 'in-progress'): DailyDocument => ({
    date, type: 'daily', updatedAt: `${date}T08:00:00Z`,
    headings: [{ name: 'Work', notesContent: '', items: [{ ...task('c1', 'Carried'), status, originalNoteDate: '2026-10-20', createdDate: '2026-10-20', carriedFromDate: date === '2026-10-20' ? undefined : '2026-10-20' }] }],
  });
  const copyOn = (docs: DailyDocument[], date: string) => docs.find((d) => d.date === date)!.headings[0].items[0];
  const docs = [carried('2026-10-20'), carried('2026-10-21', 'blocked'), carried('2026-10-22'), carried('2026-10-23', 'done')];

  it('closes open copies before the done day as done later, without touching that day or later days', () => {
    const next = closeEarlierCopies(docs, 'c1', '2026-10-22');
    for (const date of ['2026-10-20', '2026-10-21']) {
      const t = copyOn(next, date);
      expect(t).toMatchObject({ status: 'done', completedDate: '2026-10-22', doneLaterDate: '2026-10-22' });
      expect(t.historyLog.at(-1)).toMatchObject({ date: '2026-10-22', details: 'Done later on 2026-10-22' });
    }
    expect(copyOn(next, '2026-10-21').statusBeforeDone).toBe('blocked');
    expect(copyOn(next, '2026-10-22')).toBe(copyOn(docs, '2026-10-22'));
    expect(next[3]).toBe(docs[3]);
    expect(copyOn(docs, '2026-10-20').status).toBe('in-progress');
  });

  it('leaves copies that were already done or archived alone', () => {
    const withDone = [{ ...carried('2026-10-19', 'archived') }, ...docs];
    const next = closeEarlierCopies(withDone, 'c1', '2026-10-22');
    expect(next[0]).toBe(withDone[0]);
  });

  it('reopening on the done day restores the earlier copies', () => {
    const closed = closeEarlierCopies(docs, 'c1', '2026-10-22');
    const reopened = reopenEarlierCopies(closed, 'c1', '2026-10-22');
    expect(copyOn(reopened, '2026-10-20')).toMatchObject({ status: 'in-progress' });
    expect(copyOn(reopened, '2026-10-21')).toMatchObject({ status: 'blocked' });
    for (const date of ['2026-10-20', '2026-10-21']) {
      expect(copyOn(reopened, date).doneLaterDate).toBeUndefined();
      expect(copyOn(reopened, date).completedDate).toBeUndefined();
    }
  });

  it('returns the same array when nothing changes', () => {
    expect(closeEarlierCopies(docs, 'missing', '2026-10-22')).toBe(docs);
    expect(reopenEarlierCopies(docs, 'c1', '2026-10-22')).toBe(docs);
  });

  it('notes how long a carried task took when it is marked done', () => {
    const doneCopy = toggleTaskDoneInDocument(carried('2026-10-25'), 'c1', '2026-10-25')!.task;
    expect(doneCopy.historyLog.at(-1)?.details).toBe('Marked done · carried from 2026-10-20, done after 5 days');
    const fresh = toggleTaskDoneInDocument(doc([task('f1')]), 'f1', '2026-10-21')!.task;
    expect(fresh.historyLog.at(-1)?.details).toBe('Marked done');
  });
});

describe('followDoneChanges', () => {
  const day = (date: string, status: string): DailyDocument => ({
    date, type: 'daily', updatedAt: `${date}T08:00:00Z`,
    headings: [{ name: 'Work', notesContent: '', items: [{ ...task('c1', 'Carried'), status, originalNoteDate: '2026-10-20' }] }],
  });
  const docs = [day('2026-10-20', 'in-progress'), day('2026-10-21', 'in-progress')];

  it('closes earlier copies when a task becomes done on a later day, and reopens them when it is unticked', () => {
    const closed = followDoneChanges(docs, docs[1], day('2026-10-21', 'done'));
    expect(closed[0].headings[0].items[0]).toMatchObject({ status: 'done', doneLaterDate: '2026-10-21' });
    const reopened = followDoneChanges(closed, day('2026-10-21', 'done'), day('2026-10-21', 'in-progress'));
    expect(reopened[0].headings[0].items[0].status).toBe('in-progress');
  });

  it('ignores newly added done tasks and unchanged days', () => {
    expect(followDoneChanges(docs, undefined, day('2026-10-21', 'done'))).toBe(docs);
    expect(followDoneChanges(docs, docs[1], docs[1])).toBe(docs);
  });
});

describe('done-later edge cases', () => {
  const day = (date: string, status: string, extra: Partial<TaskItem> = {}): DailyDocument => ({
    date, type: 'daily', updatedAt: `${date}T08:00:00Z`,
    headings: [{ name: 'Work', notesContent: '', items: [{ ...task('c1', 'Carried'), status, originalNoteDate: '2026-10-20', ...extra }] }],
  });

  it('a closed copy reopened on its own day loses its done-later mark', () => {
    const closed = day('2026-10-20', 'done', { doneLaterDate: '2026-10-22', completedDate: '2026-10-22' });
    const reopened = day('2026-10-20', 'in-progress', { doneLaterDate: '2026-10-22' });
    const next = followDoneChanges([reopened], closed, reopened);
    expect(next[0].headings[0].items[0].doneLaterDate).toBeUndefined();
    expect(isDoneLater(next[0].headings[0].items[0])).toBe(false);
  });

  it('archiving the finished copy keeps earlier copies closed', () => {
    const docs = closeEarlierCopies([day('2026-10-20', 'in-progress'), day('2026-10-21', 'done')], 'c1', '2026-10-21');
    const next = followDoneChanges(docs, day('2026-10-21', 'done'), day('2026-10-21', 'archived'));
    expect(next[0].headings[0].items[0]).toMatchObject({ status: 'done', doneLaterDate: '2026-10-21' });
  });

  it('isDoneLater needs both done status and the mark', () => {
    expect(isDoneLater({ ...task('a'), status: 'done', doneLaterDate: '2026-10-22' })).toBe(true);
    expect(isDoneLater({ ...task('a'), status: 'in-progress', doneLaterDate: '2026-10-22' })).toBe(false);
  });
});
