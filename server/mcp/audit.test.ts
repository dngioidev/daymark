import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { AuditEntry } from '../../src/sync/mcpProtocol';
import { AuditLog } from './audit';

let root: string;
let dir: string;
let log: AuditLog;
const entry: Omit<AuditEntry, 'id' | 'at'> = {
  connectionId: 'connection-1', connectionName: 'Assistant',
  tool: 'list_tasks', action: 'read', targets: [{ key: '2026-11-12' }],
};
const now = new Date('2026-11-12T12:00:00Z');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-audit-'));
  dir = path.join(root, 'mcp-audit');
  log = new AuditLog(dir);
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

it('append then list returns newest first', async () => {
  await log.append(entry, now);
  await log.append({ ...entry, action: 'search' }, new Date('2026-11-13T01:00:00Z'));
  const loaded = await new AuditLog(dir).list();
  expect(loaded.map(item => item.action)).toEqual(['search', 'read']);
  expect(loaded[1]).toMatchObject({ ...entry, at: '2026-11-12T12:00:00.000Z' });
  expect(new Set(loaded.map(item => item.id)).size).toBe(2);
  expect(loaded.every(item => /^[0-9a-f-]{36}$/.test(item.id))).toBe(true);
});

it('list filters by connection and action', async () => {
  await log.append(entry, now);
  await log.append({ ...entry, action: 'search' }, now);
  await log.append({ ...entry, connectionId: 'connection-2' }, now);
  expect(await log.list({ connectionId: 'connection-1' })).toHaveLength(2);
  expect(await log.list({ action: 'read' })).toHaveLength(2);
  expect(await log.list({ connectionId: 'connection-1', action: 'search' })).toEqual([
    expect.objectContaining({ connectionId: 'connection-1', action: 'search' }),
  ]);
  expect(await log.list({ connectionId: 'missing' })).toEqual([]);
});

it('prune with 7 removes the file dated 8 days ago and keeps the one from 7 days ago', async () => {
  await log.append(entry, new Date('2026-11-04T23:59:59Z'));
  await log.append(entry, new Date('2026-11-05T00:00:00Z'));
  await log.append(entry, now);
  fs.writeFileSync(path.join(dir, 'keep.txt'), 'unrelated');
  expect(await log.prune(7, now)).toBe(1);
  expect(fs.readdirSync(dir).sort()).toEqual(['2026-11-05.jsonl', '2026-11-12.jsonl', 'keep.txt']);
  expect(await log.prune(7, now)).toBe(0);
});

it('damaged lines are skipped', async () => {
  await log.append(entry, now);
  fs.appendFileSync(path.join(dir, '2026-11-12.jsonl'), '{broken\nnull\n{}\n\n');
  await log.append({ ...entry, action: 'search' }, now);
  expect((await log.list()).map(item => item.action)).toEqual(['search', 'read']);
});

it('50 concurrent appends produce 50 parseable lines', async () => {
  await Promise.all(Array.from({ length: 50 }, (_, count) => log.append({ ...entry, count }, now)));
  const lines = fs.readFileSync(path.join(dir, '2026-11-12.jsonl'), 'utf8').trim().split('\n');
  expect(lines).toHaveLength(50);
  const entries = lines.map(line => JSON.parse(line) as AuditEntry);
  expect(entries.map(item => item.count)).toEqual(Array.from({ length: 50 }, (_, count) => count));
  expect(new Set(entries.map(item => item.id)).size).toBe(50);
});

it('a failed append rejects its caller without breaking later queued appends', async () => {
  const blocked = path.join(dir, '2026-11-11.jsonl');
  fs.mkdirSync(blocked);
  const failed = log.append(entry, new Date('2026-11-11T12:00:00Z'));
  const succeeded = log.append(entry, now);
  await expect(failed).rejects.toThrow();
  await expect(succeeded).resolves.toBeUndefined();
  fs.rmdirSync(blocked);
  expect(await log.list()).toEqual([expect.objectContaining({ at: '2026-11-12T12:00:00.000Z' })]);
});

it('uses UTC day files and owner-only directory and file permissions', async () => {
  await log.append(entry, new Date('2026-11-13T01:00:00+07:00'));
  expect(fs.readdirSync(dir)).toEqual(['2026-11-12.jsonl']);
  if (process.platform !== 'win32') {
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(dir, '2026-11-12.jsonl')).mode & 0o777).toBe(0o600);
  }
});

it('list defaults to 200 entries and caps requested limits at 1000 after filtering', async () => {
  const lines = Array.from({ length: 1005 }, (_, index) => JSON.stringify({
    ...entry, id: `id-${index}`, at: now.toISOString(),
  }));
  fs.writeFileSync(path.join(dir, '2026-11-12.jsonl'), `${lines.join('\n')}\n`);
  expect(await log.list()).toHaveLength(200);
  expect(await log.list({ limit: 2000 })).toHaveLength(1000);
  expect(await log.list({ limit: 2 })).toEqual([
    expect.objectContaining({ id: 'id-1004' }), expect.objectContaining({ id: 'id-1003' }),
  ]);
  expect(await log.list({ limit: 0 })).toEqual([]);
});

it('an empty audit directory lists and prunes without entries', async () => {
  expect(await log.list()).toEqual([]);
  expect(await log.prune(7, now)).toBe(0);
});
