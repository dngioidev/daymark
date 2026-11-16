import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycle21EventWeekVault, cycle21Vault } from './cycle-21-events.mjs';

test('Cycle 21 fixture schedules canonical minute-precision events and includes continuation, unscheduled, and warning cases', () => {
  const nowMs = Date.parse('2026-11-16T10:11:37.842Z');
  const fixture = cycle21Vault('2026-11-16', nowMs);
  assert.equal(fixture.events.find(event => event.id === 'c21-cross-zone').timing.startInstant, '2026-11-16T15:30:00.000Z');
  assert.equal(fixture.events.find(event => event.id === 'c21-midnight').durationMinutes, 180);
  assert.equal(fixture.events.find(event => event.id === 'c21-duration-only').timing, undefined);
  assert.equal(fixture.events.find(event => event.id === 'c21-date-only').durationMinutes, undefined);
  const warning = fixture.events.find(event => event.id === 'c21-warning');
  assert.equal(warning.timing.startInstant, '2026-11-16T10:24:00.000Z');
  assert.equal(new Date(warning.timing.startInstant).getUTCSeconds(), 0);
  assert.equal(new Date(warning.timing.startInstant).getUTCMilliseconds(), 0);
  assert.equal(fixture.clockTime.getTime(), nowMs);
});

test('Events week fixture includes overlaps, untimed entries, and a source Saturday that is Sunday in the device zone', () => {
  const fixture = cycle21EventWeekVault('2026-11-16');
  const byId = new Map(fixture.events.map(event => [event.id, event]));
  assert.equal(byId.get('c21-week-overlap-a').timing.startInstant, '2026-11-15T02:00:00.000Z');
  assert.equal(byId.get('c21-week-overlap-b').durationMinutes, 30);
  assert.equal(byId.get('c21-week-short').durationMinutes, 5);
  assert.equal(byId.get('c21-week-start-only').durationMinutes, undefined);
  assert.equal(byId.get('c21-week-late-night').timing.startInstant, '2026-11-15T16:59:00.000Z');
  assert.equal(byId.get('c21-week-late-night').durationMinutes, 1);
  assert.equal(byId.get('c21-week-date-only').timing, undefined);
  assert.equal(byId.get('c21-week-duration-only').durationMinutes, 75);
  const crossZone = byId.get('c21-week-cross-zone');
  assert.equal(crossZone.date, '2026-11-14');
  assert.equal(crossZone.timing.startInstant, '2026-11-15T06:30:00.000Z');
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(crossZone.timing.startInstant));
  const value = (type) => local.find(part => part.type === type)?.value;
  assert.equal(`${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}`, '2026-11-15 13:30');
  assert.equal(fixture.docs[0].headings[0].items[0].title, 'C21 task week remains separate');
});
