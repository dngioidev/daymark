import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycle7Fixture } from './cycle-7-fixture.mjs';

// A seed limited to yesterday/today/tomorrow leaves most week rows empty.
for (const today of ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']) {
  test(`week fixture populates the Sunday-first week containing ${today}`, () => {
    const { docs } = cycle7Fixture(today);
    const week = docs.filter(({ date }) => date >= '2026-10-25' && date <= '2026-10-31');
    assert.deepEqual(week.map(({ date }) => date).sort(), [
      '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31',
    ]);
    assert.ok(week.every((doc) => doc.headings.some(({ items }) => items.length > 0)));
    assert.equal(docs.find(({ date }) => date === today).headings[0].items.length, 9);
    const past = docs.filter(({ date }) => date < today).flatMap((doc) => doc.headings[0].items);
    assert.ok(past.some(({ status }) => status === 'done'));
    assert.ok(past.some(({ status }) => status === 'not-started'));
    assert.ok(docs.filter(({ date }) => date > today).length >= 2);
  });
}

test('week fixture crosses the year boundary without losing today or future plans', () => {
  const dates = cycle7Fixture('2027-01-01').docs.map(({ date }) => date);
  for (const date of ['2026-12-27', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']) {
    assert.ok(dates.includes(date), date);
  }
  assert.equal(new Set(dates).size, dates.length);
});
