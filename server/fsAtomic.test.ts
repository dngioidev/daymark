import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { renameWithRetry } from './fsAtomic';

const fail = (code: string) => Object.assign(new Error(`${code}: locked`), { code });

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-fsatomic-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

it('renames a file', () => {
  const from = path.join(dir, 'a.tmp');
  const to = path.join(dir, 'a.json');
  fs.writeFileSync(from, '{"ok":true}');
  renameWithRetry(from, to);
  expect(fs.readFileSync(to, 'utf8')).toBe('{"ok":true}');
  expect(fs.existsSync(from)).toBe(false);
});

it('on Windows, retries a briefly locked file (EPERM, EBUSY, EACCES) with growing waits', () => {
  for (const code of ['EPERM', 'EBUSY', 'EACCES']) {
    let calls = 0;
    const waits: number[] = [];
    renameWithRetry('a', 'b', {
      platform: 'win32',
      rename: () => { calls += 1; if (calls < 3) throw fail(code); },
      sleep: (ms) => waits.push(ms),
    });
    expect(calls).toBe(3);
    expect(waits).toEqual([10, 20]);
  }
});

it('on Windows, gives up after the last attempt and throws the original error', () => {
  let calls = 0;
  const waits: number[] = [];
  expect(() => renameWithRetry('a', 'b', {
    platform: 'win32',
    rename: () => { calls += 1; throw fail('EPERM'); },
    sleep: (ms) => waits.push(ms),
  })).toThrow('EPERM: locked');
  expect(calls).toBe(6);
  expect(waits).toEqual([10, 20, 40, 80, 160]);
});

it('does not retry other errors, or any error off Windows', () => {
  let calls = 0;
  const count = () => { calls += 1; throw fail('ENOENT'); };
  expect(() => renameWithRetry('a', 'b', { platform: 'win32', rename: count, sleep: () => {} })).toThrow('ENOENT');
  expect(calls).toBe(1);
  calls = 0;
  expect(() => renameWithRetry('a', 'b', { platform: 'linux', rename: () => { calls += 1; throw fail('EPERM'); }, sleep: () => {} })).toThrow('EPERM');
  expect(calls).toBe(1);
});
