/** Deterministic Cycle 21 UI fixture data for disposable QA/screenshot servers. */
export function cycle21Vault(today, nowMs = Date.now()) {
  const timestamp = `${today}T08:00:00.000Z`;
  const event = (id, title, date, order, patch = {}) => ({
    id, title, date, heading: 'Work', order,
    createdAt: timestamp, updatedAt: timestamp,
    ...patch,
  });
  const timed = (id, title, date, order, localTime, durationMinutes) => event(id, title, date, order, {
    timing: { localTime, timeZone: 'UTC', startInstant: `${date}T${localTime}:00.000Z` },
    ...(durationMinutes === undefined ? {} : { durationMinutes }),
  });
  const warningStartMs = Math.ceil((nowMs + 12 * 60_000) / 60_000) * 60_000;
  const warningStart = new Date(warningStartMs).toISOString();
  const warningDate = warningStart.slice(0, 10);
  const warningTime = warningStart.slice(11, 16);
  const task = {
    id: 'c21-mixed-task', title: 'Confirm final event access details', status: 'in-progress',
    createdDate: today, originalNoteDate: today, heading: 'Work', order: 1, historyLog: [],
  };
  const events = [
    timed('c21-cross-zone', 'C21 Partner planning session', today, 2, '15:30', 90),
    event('c21-date-only', 'C21 Retrospective: long-title review of the community launch and next steps', today, 3, {
      description: 'Keep notes alongside the event, without turning it into a task.',
      checklist: [{ id: 'c21-date-check', text: 'Bring the printed agenda', done: false }],
    }),
    event('c21-duration-only', 'C21 Equipment handoff', today, 4, { durationMinutes: 45 }),
    timed('c21-midnight', 'C21 Overnight maintenance', today, 5, '23:00', 180),
    timed('c21-warning', 'C21 Upcoming warning preview', warningDate, 1, warningTime, undefined),
  ];
  return {
    clockTime: new Date(nowMs),
    docs: [{ date: today, type: 'daily', updatedAt: timestamp, headings: [
      { name: 'Work', notesContent: '', items: [task] },
      { name: 'Personal', notesContent: '', items: [] },
    ] }],
    notes: [],
    events,
  };
}
