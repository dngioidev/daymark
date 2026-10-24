// Dates are supplied by the suite so every seed shares its resolved test day.
export function cycle7Fixture(today) {
  const offset = (n) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const names = ['Read a chapter', 'Walk outside', 'Drink water', 'Stretch for ten minutes', 'Write in journal'];
  const habits = names.map((name, order) => ({ id: `c7-h${order}`, name, order, warnAfterDays: 3, addedOn: offset(-7), updatedAt: `${offset(-7)}T08:00:00Z` }));
  const days = [-4, -3, -2, -1, 0].map((n) => ({ date: offset(n), ticks: Object.fromEntries(
    habits.filter((h, i) => i < 4 && (n < 0 || i < 2)).map((h) => [h.id, { done: true, at: `${offset(n)}T08:00:00Z` }]),
  ) }));
  const titles = ['Review the weekly plan', 'Prepare the release notes', 'Sketch the garden layout', 'Book the bicycle service', 'Send the project update', 'Test the offline backup', 'Plan weekend meals', 'Organise the reading list', 'Review the household budget'];
  const document = (date, taskTitles, done = false) => ({ date, type: 'daily', updatedAt: `${date}T08:00:00Z`, headings: [
    { name: 'Work', notesContent: '', items: taskTitles.map((title, order) => ({ id: `c7-${date}-${order}`, title, order, heading: 'Work',
      status: done ? 'done' : 'not-started', createdDate: date, originalNoteDate: date, historyLog: [], ...(done ? { completedDate: date } : {}) })) },
    { name: 'Ideas', notesContent: '', items: [] },
  ] });
  const weekday = new Date(`${today}T12:00:00`).getDay();
  const docs = [];
  // Fill the containing Sunday–Saturday week, plus yesterday and two future
  // days when those fall outside it. Today always keeps the busy nine-task row.
  for (let n = Math.min(-weekday, -1); n <= Math.max(6 - weekday, 2); n++) {
    const doc = document(offset(n), n === 0 ? titles : n < 0
      ? ['Finish the design review', 'Take the recycling out']
      : ['Prepare tomorrow’s agenda', 'Make time for a walk'], n < 0);
    if (n < 0) {
      doc.headings[0].items[1].status = 'not-started';
      delete doc.headings[0].items[1].completedDate;
    }
    docs.push(doc);
  }
  return { docs, habits: { habits, days } };
}
