import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pollUntil } from './poll.mjs';

test('pollUntil awaits async predicates until truthy and returns the resolved value', async () => {
  let calls = 0;
  const waits = [];
  const arg = { target: 3, value: { persisted: ['stroke-1', 'stroke-2'] } };
  const page = {
    evaluate: (fn, received) => { assert.equal(received, arg); return fn(received); },
    waitForTimeout: async interval => { waits.push(interval); },
  };
  const result = await pollUntil(page, async ({ target, value }) => {
    await Promise.resolve();
    return ++calls >= target ? value : false;
  }, arg);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [50, 50]);
  assert.deepEqual(result, arg.value);
});

test('pollUntil throws a descriptive timeout when the async predicate stays false', async t => {
  let now = 0;
  let calls = 0;
  t.mock.method(Date, 'now', () => now);
  const page = {
    evaluate: fn => { calls++; return fn(); },
    waitForTimeout: async interval => { now += interval; },
  };
  await assert.rejects(pollUntil(page, async () => false, undefined,
    { timeout: 10, interval: 5, message: 'stored ink' }), /Timed out after 10ms: stored ink/);
  assert.ok(calls > 1);
  assert.equal(now, 10);
});

test('pollUntil propagates evaluation failures instead of reporting a successful wait', async () => {
  const error = new Error('IndexedDB read failed');
  const page = { evaluate: fn => fn(), waitForTimeout: async () => assert.fail('must not retry an evaluation error') };
  await assert.rejects(pollUntil(page, async () => { throw error; }), error);
});
