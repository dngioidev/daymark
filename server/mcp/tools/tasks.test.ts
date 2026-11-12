import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn } from '../../../src/sync/authClient';
import { NO_GRANTS } from '../../../src/sync/mcpProtocol';
import { applySyncOutcome, syncOnce } from '../../../src/sync/syncClient';
import type { SyncState, VaultData } from '../../../src/sync/syncClient';
import type { DailyDocument, TaskItem } from '../../../src/types/daymark';
import { DEFAULT_SETTINGS } from '../../../src/utils/defaultData';
import { getNextDate, getPreviousDate, performDailyRollover } from '../../../src/utils/lifecycleEngine';
import { serializeDailyDocument } from '../../../src/utils/markdownEngine';
import { createApp } from '../../app';
import { signMcpToken } from '../../auth';
import { loadConfig } from '../../config';
import { FileStore } from '../../store';
import { VaultQueue } from '../../vault';
import { AuditLog } from '../audit';
import type { McpGrants } from '../../../src/sync/mcpProtocol';
import { McpStore } from '../mcpStore';
import { NOT_SHARED } from '../scope';
import { todayIn } from '../vaultView';
import { findLatestCopy } from './tasks';

const PASSWORD = 'correct horse battery';
let dir: string;
let server: Server;
let base: string;
let store: FileStore;
let mcp: McpStore;
let audit: AuditLog;
let clients: Client[];
let queue: SpyQueue;

/** Counts jobs that are queued or running, so a test can tell when requests are waiting behind a held job. */
class SpyQueue extends VaultQueue {
  pending = 0;
  run<T>(job: () => Promise<T>): Promise<T> {
    this.pending++;
    return super.run(job).finally(() => { this.pending--; });
  }
}
let today: string;
let yesterday: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-mcp-tasks-'));
  const holder = express();
  server = holder.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const config = { ...loadConfig({ NODE_ENV: 'test' }), dataDir: dir, initialPassword: PASSWORD, publicUrl: base };
  store = new FileStore(dir);
  store.init(config.username, config.initialPassword);
  mcp = new McpStore(dir);
  mcp.init();
  audit = new AuditLog(path.join(dir, 'mcp-audit'));
  queue = new SpyQueue();
  holder.use(createApp(config, store, { store: mcp, audit }, queue));
  today = todayIn(mcp.effectiveTimezone(config.timezone), new Date());
  yesterday = getPreviousDate(today, 1);
  clients = [];
});
afterEach(async () => {
  await Promise.all(clients.map(client => client.close()));
  await new Promise<void>((r) => server.close(() => r()));
  fs.rmSync(dir, { recursive: true, force: true });
});

async function assistant(access: 'full' | 'read-only', grants: Partial<McpGrants>): Promise<Client> {
  const conn = mcp.createConnection({ name: 'Assistant', clientId: 'c', clientName: 'Test', access, grants: { ...structuredClone(NO_GRANTS), ...grants } });
  const token = signMcpToken({ typ: 'mcp', cid: conn.id, ver: store.auth.tokenVersion, exp: Math.floor(Date.now() / 1000) + 600 }, store.auth.secret);
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  clients.push(client);
  return client;
}
type Result = { isError?: boolean; content: { text: string }[] };
const call = (client: Client, name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }) as Promise<Result>;
const ok = async (client: Client, name: string, args: Record<string, unknown>) => {
  const result = await call(client, name, args);
  expect(result.isError, result.content[0].text).toBeFalsy();
  return JSON.parse(result.content[0].text);
};

const vault = (docs: DailyDocument[]): VaultData => ({ ink: [], docs, notes: [], settings: DEFAULT_SETTINGS, habits: { habits: [], days: [] }, backlog: { items: [] }, notemeta: { folders: [], dismissed: [] } });
const task = (id: string, heading: string, date: string, extra: Partial<TaskItem> = {}): TaskItem => ({
  id, title: `Task ${id}`, status: 'in-progress', createdDate: date, originalNoteDate: date, heading, order: 1, historyLog: [], ...extra,
});
const day = (date: string, sections: Record<string, TaskItem[]>): DailyDocument => ({
  date, type: 'daily', updatedAt: `${date}T00:00:00Z`,
  headings: Object.entries(sections).map(([name, items]) => ({ name, items, notesContent: '' })),
});

interface Device { state: SyncState & { accessToken: string }; local: VaultData }
async function device(name: string, docs: DailyDocument[] = []): Promise<Device> {
  const data = await signIn(fetch, base, 'body', { username: 'admin', password: PASSWORD, deviceName: name, platform: 'test' });
  const state = { serverUrl: base, username: data.username, deviceName: data.device.name, accessToken: data.accessToken, deviceId: data.device.id, refreshToken: data.refreshToken, lastRev: 0, bases: {}, lastSyncAt: null };
  return { state, local: vault(docs) };
}
async function sync(dev: Device): Promise<void> {
  const outcome = await syncOnce(fetch, dev.local, dev.state, dev.state.accessToken);
  dev.local = applySyncOutcome(dev.local, outcome);
  dev.state = { ...outcome.state, accessToken: dev.state.accessToken };
}
const stored = (date: string) => store.vault.entities[`doc:${date}`]?.value as DailyDocument | undefined;
const copies = (docs: DailyDocument[], id: string) => docs.flatMap(d => d.headings.flatMap(h => h.items.filter(t => t.id === id).map(t => ({ date: d.date, heading: h.name, t }))));

describe('task write tools', () => {
  it('create_task lands under the granted heading and appears in a device pull', async () => {
    const ai = await assistant('full', { headings: ['Work'] });
    const created = await ok(ai, 'create_task', { title: 'Write report', heading: 'work', tags: ['q4'], checklist: ['draft'] });
    expect(created).toMatchObject({ date: today, heading: 'Work', status: 'not-started' });
    const phone = await device('phone');
    await sync(phone);
    const pulled = phone.local.docs.find(d => d.date === today)!;
    expect(pulled.headings.find(h => h.name === 'Work')!.items).toEqual([expect.objectContaining({
      id: created.id, title: 'Write report', tags: ['q4'], checklist: [expect.objectContaining({ text: 'draft', done: false })],
      historyLog: [expect.objectContaining({ action: 'created' })],
    })]);
    expect(store.vault.entities[`doc:${today}`].updatedBy).toBe(`mcp:${mcp.connections[0].id}`);
    const entries = await audit.list({ connectionId: mcp.connections[0].id });
    expect(entries).toEqual([expect.objectContaining({ tool: 'create_task', action: 'create', targets: [{ key: `doc:${today}` }] })]);
    expect(JSON.stringify(entries)).not.toContain('Write report');
  });

  it('create_task into a non-granted heading is refused and nothing is written', async () => {
    const ai = await assistant('full', { headings: ['Work'] });
    const rev = store.vault.rev;
    const result = await call(ai, 'create_task', { title: 'Nope', heading: 'Personal' });
    expect(result).toMatchObject({ isError: true, content: [{ text: NOT_SHARED }] });
    expect(store.vault.rev).toBe(rev);
    expect(stored(today)).toBeUndefined();
  });

  it('refuses moves into or out of a heading that is not granted', async () => {
    const seeder = await device('seed');
    seeder.local = vault([day(today, { Work: [task('w', 'Work', today)], Personal: [task('p', 'Personal', today)] })]);
    await sync(seeder);
    const ai = await assistant('full', { headings: ['Work'] });
    const rev = store.vault.rev;
    for (const args of [{ taskId: 'w', heading: 'Personal' }, { taskId: 'p', heading: 'Work' }, { taskId: 'p', title: 'x' }]) {
      expect(await call(ai, 'update_task', args)).toMatchObject({ isError: true, content: [{ text: NOT_SHARED }] });
    }
    expect(store.vault.rev).toBe(rev);
    await ok(ai, 'update_task', { taskId: 'w', heading: 'Work', title: 'renamed' });
    expect(await ok(ai, 'update_task', { taskId: 'w', status: 'done' })).toMatchObject({ status: 'done' });
  });

  it('read-only connection cannot complete', async () => {
    const seeder = await device('seed');
    seeder.local = vault([day(today, { Work: [task('w', 'Work', today)] })]);
    await sync(seeder);
    const ai = await assistant('read-only', { headings: ['Work'] });
    const rev = store.vault.rev;
    expect(await call(ai, 'complete_task', { taskId: 'w' })).toMatchObject({ isError: true, content: [{ text: NOT_SHARED }] });
    expect(store.vault.rev).toBe(rev);
  });

  it('complete_task on a carried task closes earlier copies like the app does, and reopen undoes it', async () => {
    const seeder = await device('seed');
    seeder.local = vault([day(yesterday, { Work: [task('t', 'Work', yesterday)] })]);
    await sync(seeder);
    const ai = await assistant('full', { all: true });
    expect(await ok(ai, 'complete_task', { taskId: 't' })).toMatchObject({ date: today, status: 'done' });
    expect(copies([stored(yesterday)!], 't')[0].t).toMatchObject({ status: 'done', doneLaterDate: today });
    const done = copies([stored(today)!], 't')[0].t;
    expect(done).toMatchObject({ status: 'done', completedDate: today, historyLog: expect.arrayContaining([expect.objectContaining({ action: 'status_changed' })]) });
    await ok(ai, 'reopen_task', { taskId: 't' });
    expect(copies([stored(yesterday)!], 't')[0].t).toMatchObject({ status: 'in-progress' });
    expect(copies([stored(yesterday)!], 't')[0].t.doneLaterDate).toBeUndefined();
    expect(copies([stored(today)!], 't')[0].t).toMatchObject({ status: 'in-progress' });
  });

  it('delete_task does not come back after the next day rollover', async () => {
    const seeder = await device('seed');
    seeder.local = vault([day(yesterday, { Work: [task('t', 'Work', yesterday)] })]);
    await sync(seeder);
    const ai = await assistant('full', { all: true });
    await ok(ai, 'delete_task', { taskId: 't' });
    expect(stored(today)!.removedTaskIds).toContain('t');
    const docs = Object.keys(store.vault.entities).filter(k => k.startsWith('doc:')).map(k => store.vault.entities[k].value as DailyDocument);
    const rolled = performDailyRollover(getNextDate(today), docs, DEFAULT_SETTINGS.statuses, DEFAULT_SETTINGS.defaultHeadings).updatedDocs;
    expect(copies(rolled.filter(d => d.date === getNextDate(today)), 't')).toEqual([]);
    const entries = await audit.list({ connectionId: mcp.connections[0].id });
    expect(entries[0]).toMatchObject({ tool: 'delete_task', action: 'delete' });
  });

  it('concurrent device push and AI write both survive', async () => {
    const seeder = await device('seed');
    seeder.local = vault([day(today, { Work: [task('a', 'Work', today), task('b', 'Work', today)] })]);
    await sync(seeder);
    const phone = await device('phone');
    await sync(phone);
    phone.local = { ...phone.local, docs: phone.local.docs.map(d => d.date !== today ? d : {
      ...d, updatedAt: new Date().toISOString(),
      headings: d.headings.map(h => ({ ...h, items: h.items.map(t => t.id === 'a' ? { ...t, title: 'A from phone' } : t) })),
    }) };
    const ai = await assistant('full', { all: true });
    await Promise.all([sync(phone), ok(ai, 'update_task', { taskId: 'b', title: 'B from AI' })]);
    await sync(phone);
    const items = stored(today)!.headings[0].items;
    expect(items.find(t => t.id === 'a')!.title).toBe('A from phone');
    expect(items.find(t => t.id === 'b')!.title).toBe('B from AI');
  });

  it('device push and AI write held behind the shared queue are applied in order and both survive', async () => {
    const seeder = await device('seed');
    seeder.local = vault([day(today, { Work: [task('a', 'Work', today), task('b', 'Work', today)] })]);
    await sync(seeder);
    const phone = await device('phone');
    await sync(phone);
    phone.local = { ...phone.local, docs: phone.local.docs.map(d => d.date !== today ? d : {
      ...d, updatedAt: new Date().toISOString(),
      headings: d.headings.map(h => ({ ...h, items: h.items.map(t => t.id === 'a' ? { ...t, title: 'A from phone' } : t) })),
    }) };
    const ai = await assistant('full', { all: true });

    let release!: () => void;
    const held = queue.run(() => new Promise<void>((resolve) => { release = resolve; }));
    const phoneSync = sync(phone);
    await vi.waitFor(() => expect(queue.pending).toBe(2)); // the phone push waits behind the held job
    const aiEdit = ok(ai, 'update_task', { taskId: 'b', title: 'B from AI' });
    await vi.waitFor(() => expect(queue.pending).toBe(3)); // so does the AI write
    expect(stored(today)!.headings[0].items.find(t => t.id === 'a')!.title).toBe('Task a');
    release();
    await Promise.all([held, phoneSync, aiEdit]);
    const items = stored(today)!.headings[0].items;
    expect(items.find(t => t.id === 'a')!.title).toBe('A from phone');
    expect(items.find(t => t.id === 'b')!.title).toBe('B from AI');
  });

  it('AI-created today followed by device rollover and sync gives one copy of each task', async () => {
    const phone = await device('phone', [day(yesterday, { Work: [task('old', 'Work', yesterday)] })]);
    await sync(phone);
    const ai = await assistant('full', { all: true });
    const created = await ok(ai, 'create_task', { title: 'Fresh', heading: 'Work' });
    const rolled = performDailyRollover(today, phone.local.docs, DEFAULT_SETTINGS.statuses, DEFAULT_SETTINGS.defaultHeadings).updatedDocs;
    phone.local = { ...phone.local, docs: rolled };
    await sync(phone);
    await sync(phone);
    const all = [...phone.local.docs, ...Object.keys(store.vault.entities).filter(k => k.startsWith('doc:')).map(k => store.vault.entities[k].value as DailyDocument)];
    for (const docs of [phone.local.docs, all.slice(phone.local.docs.length)]) {
      expect(copies(docs.filter(d => d.date === today), 'old')).toHaveLength(1);
      expect(copies(docs.filter(d => d.date === today), created.id)).toHaveLength(1);
    }
  });

  it('written docs keep the task comment format after serializeDailyDocument', async () => {
    const ai = await assistant('full', { all: true });
    const created = await ok(ai, 'create_task', { title: 'Check format', heading: 'Work', description: 'details' });
    await ok(ai, 'append_section_notes', { heading: 'Work', text: 'Standup went fine.' });
    const markdown = serializeDailyDocument(stored(today)!);
    expect(markdown).toContain(`<!-- daymark: task_id=${created.id} status=not-started created=${today} -->`);
    expect(markdown).toContain('Standup went fine.');
  });

  it('findLatestCopy returns the newest day holding the id', () => {
    const docs = [day('2026-11-10', { Work: [task('t', 'Work', '2026-11-10')] }), day('2026-11-12', { Ideas: [task('t', 'Ideas', '2026-11-10')] }), day('2026-11-11', {})];
    expect(findLatestCopy(docs, 't')).toMatchObject({ date: '2026-11-12', heading: 'Ideas' });
    expect(findLatestCopy(docs, 'missing')).toBeNull();
  });
});
