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

/** Deterministic feature fixture for the separate, device-zone Events week calendar. */
export function cycle21EventWeekVault(today) {
  const parse = (date) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) throw new Error(`Invalid fixture date: ${date}`);
    const value = new Date(0);
    value.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    value.setUTCHours(0, 0, 0, 0);
    return value;
  };
  const format = (date) => `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  const shift = (date, days) => {
    const value = parse(date);
    value.setUTCDate(value.getUTCDate() + days);
    return format(value);
  };
  const todayDate = parse(today);
  const sundayDate = new Date(todayDate.getTime());
  sundayDate.setUTCDate(sundayDate.getUTCDate() - sundayDate.getUTCDay());
  const sunday = format(sundayDate);
  const saturday = shift(sunday, -1);
  const timestamp = `${today}T08:00:00.000Z`;
  const make = (id, title, date, order, patch = {}) => ({
    id, title, date, heading: 'Work', order, createdAt: timestamp, updatedAt: timestamp, ...patch,
  });
  const utcTimed = (id, title, date, localTime, durationMinutes, order) => make(id, title, date, order, {
    timing: { localTime, timeZone: 'UTC', startInstant: `${date}T${localTime}:00.000Z` },
    ...(durationMinutes === undefined ? {} : { durationMinutes }),
  });
  const events = [
    utcTimed('c21-week-overlap-a', 'C21 Design review', sunday, '02:00', 45, 1),
    utcTimed('c21-week-overlap-b', 'C21 Partner review', sunday, '02:00', 30, 2),
    utcTimed('c21-week-short', 'C21 Quick handoff', sunday, '02:50', 5, 3),
    utcTimed('c21-week-start-only', 'C21 Optional arrival', sunday, '04:30', undefined, 4),
    utcTimed('c21-week-late-night', 'C21 Final minute check', sunday, '16:59', 1, 5),
    make('c21-week-date-only', 'C21 Date-only reminder', sunday, 6),
    make('c21-week-duration-only', 'C21 Unscheduled work block', sunday, 7, { durationMinutes: 75 }),
    make('c21-week-cross-zone', 'C21 Saturday original, Sunday local', saturday, 8, {
      timing: { localTime: '23:30', timeZone: 'America/Phoenix', startInstant: `${sunday}T06:30:00.000Z` },
      durationMinutes: 45,
    }),
  ];
  const task = { id: 'c21-week-task', title: 'C21 task week remains separate', status: 'in-progress', createdDate: today,
    originalNoteDate: today, heading: 'Work', order: 1, historyLog: [] };
  return {
    weekStart: sunday,
    originalSaturday: saturday,
    docs: [{ date: today, type: 'daily', updatedAt: timestamp, headings: [{ name: 'Work', notesContent: '', items: [task] }] }],
    events,
  };
}
