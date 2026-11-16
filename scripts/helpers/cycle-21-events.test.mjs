import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycle21Vault } from './cycle-21-events.mjs';

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
