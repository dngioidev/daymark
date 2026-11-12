import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signIn } from '../../../src/sync/authClient';
import { NO_GRANTS } from '../../../src/sync/mcpProtocol';
import { applySyncOutcome, syncOnce } from '../../../src/sync/syncClient';
import type { SyncState, VaultData } from '../../../src/sync/syncClient';
import type { DailyDocument } from '../../../src/types/daymark';
import { DEFAULT_SETTINGS } from '../../../src/utils/defaultData';
import { getNextDate, getPreviousDate } from '../../../src/utils/lifecycleEngine';
import { createApp } from '../../app';
import { signMcpToken } from '../../auth';
import { loadConfig } from '../../config';
import { FileStore } from '../../store';
import { AuditLog } from '../audit';
import type { McpGrants } from '../../../src/sync/mcpProtocol';
import { McpStore } from '../mcpStore';
import { NOT_SHARED } from '../scope';
import { todayIn } from '../vaultView';


const PASSWORD = 'correct horse battery';
let dir: string;
let server: Server;
let base: string;
let store: FileStore;
let mcp: McpStore;
let audit: AuditLog;
let clients: Client[];
let today: string;
let yesterday: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-mcp-content-'));
  const holder = express();
  server = holder.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const config = { ...loadConfig({ NODE_ENV: 'test' }), dataDir: dir, initialPassword: PASSWORD, publicUrl: base };
  store = new FileStore(dir);
  store.init(config.username, config.initialPassword);
  mcp = new McpStore(dir);
  mcp.init();
  audit = new AuditLog(path.join(dir, 'mcp-audit'));
  holder.use(createApp(config, store, { store: mcp, audit }));
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


describe('content write tools', () => {
  it('create_note in a granted subfolder works; in another folder is refused', async () => {
    const ai = await assistant('full', { folders: ['Work'] });
    const note = await ok(ai, 'create_note', { title: 'Plan', folder: 'Work/Plans', content: 'draft', tags: ['next'] });
    expect(note).toMatchObject({ id: expect.stringMatching(/^note-\d+$/), title: 'Plan', tags: ['next'] });
    const rev = store.vault.rev;
    expect(await call(ai, 'create_note', { title: 'Private', folder: 'Personal', content: '' })).toMatchObject({ isError: true, content: [{ text: NOT_SHARED }] });
    expect(store.vault.rev).toBe(rev);
  });
  it('moving a note out of scope is refused', async () => {
    const ai = await assistant('full', { folders: ['Work'] });
    const note = await ok(ai, 'create_note', { title: 'Plan', folder: 'Work', content: 'draft' });
    const rev = store.vault.rev;
    expect(await call(ai, 'update_note', { id: note.id, folder: 'Personal', content: 'changed' })).toMatchObject({ isError: true, content: [{ text: NOT_SHARED }] });
    expect(store.vault.rev).toBe(rev);
    await ok(ai, 'update_note', { id: note.id, title: 'Renamed', folder: 'Work/Sub', tags: [] });
    expect(await ok(ai, 'append_note', { id: note.id, text: 'more' })).toMatchObject({ title: 'Renamed', content: 'draft\nmore', folder: 'Work/Sub' });
    const owner = await assistant('full', { all: true });
    const privateNote = await ok(owner, 'create_note', { title: 'Private', folder: 'Personal', content: 'secret' });
    const before = store.vault.rev;
    expect(await call(ai, 'update_note', { id: privateNote.id, folder: 'Work' })).toMatchObject({ isError: true, content: [{ text: NOT_SHARED }] });
    expect(store.vault.rev).toBe(before);
  });
  it('concurrent appends preserve both writes and audit only entity targets', async () => {
    const ai = await assistant('full', { all: true });
    const note = await ok(ai, 'create_note', { title: 'Plan', folder: '', content: 'start' });
    await Promise.all(['first', 'second'].map(text => ok(ai, 'append_note', { id: note.id, text })));
    const saved = await ok(ai, 'get_note', { id: note.id });
    expect(saved.content.split('\n').sort()).toEqual(['first', 'second', 'start']);
    const entries = (await audit.list({ connectionId: mcp.connections[0].id })).filter(e => e.tool === 'append_note');
    expect(entries).toHaveLength(2);
    for (const entry of entries) expect(entry).toMatchObject({ action: 'update', targets: [{ key: `note:${note.id}` }] });
    expect(JSON.stringify(entries)).not.toMatch(/first|second|start/);
  });
  it('delete_note writes a tombstone that a device pull applies', async () => {
    const ai = await assistant('full', { all: true });
    const note = await ok(ai, 'create_note', { title: 'Plan', folder: '', content: 'draft' });
    const phone = await device('phone');
    await sync(phone);
    expect(phone.local.notes.map(n => n.id)).toContain(note.id);
    await ok(ai, 'delete_note', { id: note.id });
    expect(store.vault.entities[`note:${note.id}`].value).toBeNull();
    await sync(phone);
    expect(phone.local.notes).toEqual([]);
    const entries = await audit.list({ connectionId: mcp.connections[0].id });
    expect(entries.map(e => e.action).sort()).toEqual(['create', 'delete']);
    expect(JSON.stringify(entries)).not.toContain('draft');
    expect((await ai.listTools()).tools.find(t => t.name === 'delete_note')?.annotations?.destructiveHint).toBe(true);
  });
  it('pick_backlog_item into a non-granted heading is refused and changes nothing', async () => {
    const ai = await assistant('full', { backlog: true, headings: ['Work'] });
    const item = await ok(ai, 'add_backlog_item', { title: 'Idea', category: 'Personal' });
    const before = structuredClone(store.vault);
    expect(await call(ai, 'pick_backlog_item', { id: item.id })).toMatchObject({ isError: true, content: [{ text: NOT_SHARED }] });
    expect(store.vault).toEqual(before);
    await ok(ai, 'update_backlog_item', { id: item.id, category: 'work', description: 'details' });
    await ok(ai, 'pick_backlog_item', { id: item.id });
    expect(stored(today)!.headings.find(h => h.name === 'Work')!.items).toEqual([expect.objectContaining({ id: item.id, description: 'details' })]);
    const rev = store.vault.rev;
    expect((await call(ai, 'pick_backlog_item', { id: item.id })).isError).toBe(true);
    expect(store.vault.rev).toBe(rev);
    const other = await ok(ai, 'add_backlog_item', { title: 'Remove' });
    await ok(ai, 'delete_backlog_item', { id: other.id });
    expect(await ok(ai, 'list_backlog', {})).toEqual([]);
  });
  it('tick_habit writes habitday and streak updates', async () => {
    const seed = await device('seed');
    seed.local.habits = { habits: [{ id: 'h', name: 'Read', order: 0, warnAfterDays: 3, addedOn: yesterday, updatedAt: new Date().toISOString() }], days: [] };
    await sync(seed);
    const ai = await assistant('full', { habits: true });
    await ok(ai, 'tick_habit', { habitId: 'h', done: true, date: yesterday });
    await ok(ai, 'tick_habit', { habitId: 'h', done: true });
    expect(store.vault.entities[`habitday:${today}`].value).toMatchObject({ date: today, ticks: { h: { done: true, at: expect.any(String) } } });
    expect(await ok(ai, 'list_habits', {})).toEqual([expect.objectContaining({ done: true, streak: 2 })]);
    await sync(seed);
    expect(seed.local.habits.days).toHaveLength(2);
    await ok(ai, 'tick_habit', { habitId: 'h', done: false, date: yesterday });
    expect(await ok(ai, 'list_habits', {})).toEqual([expect.objectContaining({ streak: 1 })]);
    const rev = store.vault.rev;
    expect((await call(ai, 'tick_habit', { habitId: 'missing', done: true })).isError).toBe(true);
    expect((await call(ai, 'tick_habit', { habitId: 'h', done: true, date: getNextDate(today) })).isError).toBe(true);
    expect(store.vault.rev).toBe(rev);
  });
  it('handwritten notes are returned without ink strokes', async () => {
    const seed = await device('seed');
    seed.local.notes = [{ id: 'hand', title: 'Handwriting', folder: 'Work', content: 'text', tags: [], kind: 'handwritten', paper: 'lined', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
    seed.local.ink = [{ noteId: 'hand', page: 0, strokes: [{ id: 's', tool: 'pen', color: '#000', width: 1, points: 'c2VjcmV0', createdAt: new Date().toISOString() }], removed: [], updatedAt: new Date().toISOString() }];
    await sync(seed);
    const ai = await assistant('full', { folders: ['Work'] });
    for (const result of [await ok(ai, 'get_note', { id: 'hand' }), await ok(ai, 'append_note', { id: 'hand', text: 'more' })]) {
      expect(result).toMatchObject({ kind: 'handwritten', paper: 'lined' });
      expect(JSON.stringify(result)).not.toContain('c2VjcmV0');
      expect(result.strokes).toBeUndefined();
    }
    await sync(seed);
    expect(seed.local.ink[0].strokes[0].points).toBe('c2VjcmV0');
  });
  it('refuses writes for read-only connections and missing grants', async () => {
    for (const ai of [await assistant('read-only', { all: true }), await assistant('full', {})]) {
      const rev = store.vault.rev;
      for (const [name, args] of [
        ['create_note', { title: 'No', folder: '', content: '' }],
        ['add_backlog_item', { title: 'No' }], ['tick_habit', { habitId: 'h', done: true }],
      ] as const) expect(await call(ai, name, args)).toMatchObject({ isError: true, content: [{ text: NOT_SHARED }] });
      expect(store.vault.rev).toBe(rev);
    }
  });
});
