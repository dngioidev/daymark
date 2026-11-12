import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { acquireDataLock, DataLockError } from './lock';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-lock-')); });
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

it('second acquire throws DataLockError naming the owner', () => {
  fs.writeFileSync(path.join(dir, 'daymark.lock'), JSON.stringify({ owner: 'server', pid: process.ppid, startedAt: '2026-11-12T00:00:00Z' }));
  const attempt = () => acquireDataLock(dir, 'stdio');
  expect(attempt).toThrow(DataLockError);
  expect(attempt).toThrow(`Daymark data in ${dir} is in use by the server (pid ${process.ppid}). Stop it first.`);
});

it('takes over a stale lock naming the current pid', () => {
  fs.writeFileSync(path.join(dir, 'daymark.lock'), JSON.stringify({ owner: 'server', pid: process.pid, startedAt: '2026-11-12T00:00:00Z' }));
  const release = acquireDataLock(dir, 'stdio');
  expect(JSON.parse(fs.readFileSync(path.join(dir, 'daymark.lock'), 'utf8'))).toEqual({
    owner: 'stdio', pid: process.pid, hostname: os.hostname(), startedAt: expect.any(String),
  });
  release();
});

it('stale lock with a dead pid is taken over', () => {
  fs.writeFileSync(path.join(dir, 'daymark.lock'), JSON.stringify({ owner: 'server', pid: 999999, startedAt: '2026-11-12T00:00:00Z' }));
  const release = acquireDataLock(dir, 'stdio');
  expect(JSON.parse(fs.readFileSync(path.join(dir, 'daymark.lock'), 'utf8'))).toEqual({
    owner: 'stdio', pid: process.pid, hostname: os.hostname(), startedAt: expect.any(String),
  });
  release();
});

it('release removes the file', () => {
  const release = acquireDataLock(dir, 'stdio');
  release();
  expect(fs.existsSync(path.join(dir, 'daymark.lock'))).toBe(false);
  release();
  const releaseAgain = acquireDataLock(dir, 'server');
  release();
  expect(fs.existsSync(path.join(dir, 'daymark.lock'))).toBe(true);
  releaseAgain();
});

it('does not take over a lock when checking the pid is denied', () => {
  fs.writeFileSync(path.join(dir, 'daymark.lock'), JSON.stringify({ owner: 'stdio', pid: process.ppid, startedAt: '2026-11-12T00:00:00Z' }));
  vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); });
  expect(() => acquireDataLock(dir, 'server')).toThrow(DataLockError);
});
